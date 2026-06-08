/**
 * Auth.gs — Simple password authentication
 * Uses PropertiesService for credentials and CacheService for sessions.
 */

var SESSION_DURATION_SECONDS = 3600; // 1 hour

/**
 * Checks username and password against stored credentials.
 * Default password is stored in Script Properties as "UPLOAD_PASSWORD".
 *
 * @param {string} username
 * @param {string} password
 * @returns {boolean} true if valid
 */
function checkAuth(username, password) {
  if (!username || !password) return false;

  var props = PropertiesService.getScriptProperties();
  var storedPassword = props.getProperty('UPLOAD_PASSWORD') || 'tmart2024';

  // Simple credential check
  // Users: tMart (default)
  var validUsers = props.getProperty('VALID_USERS');
  var users;

  if (validUsers) {
    try {
      users = JSON.parse(validUsers);
    } catch (e) {
      users = [{ username: 'tMart', password: storedPassword }];
    }
  } else {
    users = [{ username: 'tMart', password: storedPassword }];
  }

  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === username.toLowerCase()) {
      if (users[i].password === password) {
        return true;
      }
      // Also support hashed passwords (simple SHA-256)
      if (users[i].password_hash) {
        var inputHash = computeHash(password);
        if (users[i].password_hash === inputHash) {
          return true;
        }
      }
      return false;
    }
  }

  return false;
}

/**
 * Handles login POST request.
 * Creates a session token stored in CacheService.
 *
 * @param {Object} e - The doPost event object
 * @returns {Object} Result with success/error and token
 */
function handleLogin(e) {
  try {
    var body;
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      return { error: 'No data provided' };
    }

    var username = (body.username || '').trim();
    var password = body.password || '';

    if (!username || !password) {
      return { error: 'Username and password required' };
    }

    if (!checkAuth(username, password)) {
      return { error: 'Invalid username or password' };
    }

    // Create session token
    var token = generateToken();
    var cache = CacheService.getScriptCache();

    // Store session: token -> username mapping
    cache.put('session_' + token, username, SESSION_DURATION_SECONDS);

    return {
      success: true,
      username: username,
      token: token,
      expires_in: SESSION_DURATION_SECONDS
    };
  } catch (err) {
    return { error: 'Login failed: ' + err.message };
  }
}

/**
 * Handles logout POST request.
 * Removes session from CacheService.
 *
 * @param {Object} e - The doPost event object
 * @returns {Object} Result with success/error
 */
function handleLogout(e) {
  try {
    var token = getTokenFromRequest(e);
    if (token) {
      var cache = CacheService.getScriptCache();
      cache.remove('session_' + token);
    }
    return { success: true };
  } catch (err) {
    return { error: 'Logout failed: ' + err.message };
  }
}

/**
 * Checks if the request is authenticated.
 *
 * @param {Object} e - The event object (doGet or doPost)
 * @returns {boolean} true if authenticated
 */
function isAuthenticated(e) {
  var token = getTokenFromRequest(e);
  if (!token) return false;

  var cache = CacheService.getScriptCache();
  var username = cache.get('session_' + token);
  return !!username;
}

/**
 * Gets the auth token from the request.
 * Checks query parameter 'token' or the JSON body 'token' field.
 *
 * @param {Object} e - The event object
 * @returns {string|null} The token or null
 */
function getTokenFromRequest(e) {
  if (!e) return null;

  // Check query parameter
  if (e.parameter && e.parameter.token) {
    return e.parameter.token;
  }

  // Check POST body
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body.token) return body.token;
    } catch (ignored) {}
  }

  return null;
}

/**
 * Generates a random session token.
 *
 * @returns {string} A random hex string
 */
function generateToken() {
  var chars = 'abcdef0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Computes a simple SHA-256 hash of a string.
 * Uses Utilities.computeDigest.
 *
 * @param {string} input
 * @returns {string} Hex-encoded hash
 */
function computeHash(input) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  var hex = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byte = rawHash[i];
    if (byte < 0) byte += 256;
    var byteHex = byte.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hex += byteHex;
  }
  return hex;
}
