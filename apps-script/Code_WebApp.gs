function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Stock Efficiency Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
