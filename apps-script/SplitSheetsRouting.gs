/** Google Sheets routing for staged migration. DO NOT enable until migration reconciled.
 * The old bound spreadsheet remains canonical unless SPLIT_SHEETS_ENABLED === 'true'.
 */
var SPLIT_SHEETS_MAP_ = {
  'Timesheets':'1ODBQHmm6K8l8G7BRI4yQXNtEGZ2KU52Evk13KfmXMx8',
  'Timesheet Audit':'1l3UeQAI9V3G4NKtIR9kt-cQr5qLW29p6uKn_hhWlq_Y',
  'Timesheet Approvals':'1WvDoU0APaV51rq0OwM1Ffq1wCerWqQzoV9_KP_pqRJg',
  'Hi Clock Events':'1nwWJRCZPECEZg-mkd7kYRYmuY_fan5NqHC1UqbNTlcA',
  'TimeTreeEvents':'1s_9tB67giobdXUZ0poGlKChDLEkDYRXET8IoupxcBzk',
  'TimeTreeHistory':'1e2kBkl3BQ5pDDmp_ydQBIWk-j0RoEsKIP1DDGLP1O94',
  'Stock':'1zhWI_SYGYo275o9r19WtKJhuEsjjYSDFieiI3x5F9ME',
  'Stock_Counts':'1aj7stY5JWY5ztlfAkwGJJ9Gm6OW8_eAe9vubGqcJin8',
  'HiService_Stock':'14LGYSmY0TNGOqfaKEe3cnujE4FVApm1tu9vSWkHWxQs',
  'HiService_Stock_Counts':'1Lwdpos3Uswtf97HRCJV3PbStJoJGiceIoo5nAh6arvc',
  'HiService_Stock_Movements':'1Zqc2R3GYGX7AN-9Oz-x6edj4W1Bp4SdyYQsoH7gWGhw'
};
function splitSheetsEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('SPLIT_SHEETS_ENABLED') === 'true';
}
function dataSpreadsheet_(sheetName) {
  if (!splitSheetsEnabled_()) return SpreadsheetApp.getActiveSpreadsheet();
  var id=SPLIT_SHEETS_MAP_[sheetName];
  if (!id) throw new Error('Split Sheets route missing for '+sheetName);
  var ss=SpreadsheetApp.openById(id);
  if(!ss.getSheetByName(sheetName))throw new Error('Split Sheets destination missing tab '+sheetName);
  return ss;
}
function splitSheetsPreflight_() {
  var result={enabled:splitSheetsEnabled_(),verified:[],failed:[]};
  Object.keys(SPLIT_SHEETS_MAP_).forEach(function(name) {
    try { var sh=SpreadsheetApp.openById(SPLIT_SHEETS_MAP_[name]).getSheetByName(name);
      if(!sh)throw Error('Missing tab');
      result.verified.push({name:name,rows:sh.getLastRow(),columns:sh.getLastColumn()});
    } catch(e) {result.failed.push({name:name,error:String(e)});}
  });
  return result;
}
