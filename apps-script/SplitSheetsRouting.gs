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
  'HiService_Stock_Movements':'1Zqc2R3GYGX7AN-9Oz-x6edj4W1Bp4SdyYQsoH7gWGhw',
  'UserPermissions':'1POVfLZB8CxL6vCqJe-oqVAOKCTd7KRyaqB3Nkuh0mjI',
  'PurchaseOrders':'1-J0Hz5IPqZlBRAOyGv43Xi06q5TU48RmLt9-OOpbG14',
  'PriceUpdates':'1j8iNP9Wo4s-gnXOjUAcA5DpXjr0tpiss_xydGpnffqM',
  'Calendar':'1x3IVqaLVq0MUM_bWs7-Cw-tcmPW-eeHvhNKIzyx3_W8',
  'Sangwani':'1Em_pK20pnmosAEg_vKw-U3oVHGnK2-fJFhH81L6ud5I',
  'sangwannyasulu':'1dEuu2Ac5v2Jy_bwIF_CoGiATeQ31KZHMNTGZwEHbGZw',
  'Michael':'1VylUNL_gYt67eFJoUW_fzJE7ZTF1-4BpY9ZILp_c77Y',
  'Ian':'11bz44sgtE-h4ERVATmJTT5K3LYxOEgSX2coZ9ELUI4E',
  'Jacobus':'1dwbo01bZUT8ikElCcfTNBa12GEDaNcmnGDNHY7uMkbY',
  'Frank':'1RDDdxRKDQFb3ryTBKMGgqR-q_ElN5vfq5OAZCxZswW8',
  'Workers':'1d6D2Dq4FSTDSCQ4Ea3shsmv70hpaeos7u0wnP7ZfQcE',
  'Summary':'1cHlAF9sx0wd6wvrIIWTTgJH4ZzaplR0PM4tYgV1vrpc',
  'JobCards':'1eC6rqi4OLoF0u4bEqVNscFVDPcmBep3jsb9shb2JtmQ',
  'Prices':'1nXhrDwAwxPb6nknKQSB6zPkFBYxPqa6n9a_7UBtHA7Q',
  'Proposals':'1Aj-HUZeWoUN6zGy1j64tDafEzjl8dMi6F96_gl9hGN8',
  'Log':'1zVuLd-c6hbOebF7mVA4DhkRGxD8oBO9S3wsM0uSiPrA',
  'Users':'1QhzViC5kPmC71qQlIM8INLYbQ_RgnbJoRHgyZz_tW7s'
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

/** Read-only migration reconciliation. Reports copy drift before any cutover.
 * Current source remains authoritative during migration.
 */
function splitSheetsReconcile_(){
  var old=SpreadsheetApp.openById('1OtZIGMbX-mdaANNI9R8Ly9yFWlsYnME76eUCPCfD55w');
  var report={checkedAt:new Date().toISOString(),matched:[],mismatched:[],errors:[],unmapped:[]};
  old.getSheets().forEach(function(sh){
    var name=sh.getName(),destId=SPLIT_SHEETS_MAP_[name];
    if(!destId){report.unmapped.push(name);return;}
    try{
      var dst=SpreadsheetApp.openById(destId).getSheetByName(name);
      if(!dst)throw new Error('Destination tab missing');
      var a={rows:sh.getLastRow(),columns:sh.getLastColumn()};
      var b={rows:dst.getLastRow(),columns:dst.getLastColumn()};
      // Compare headers and the last populated row, in addition to dimensions.
      var n=Math.max(a.columns,b.columns),headA=n?sh.getRange(1,1,1,n).getDisplayValues()[0]:[];
      var headB=n?dst.getRange(1,1,1,n).getDisplayValues()[0]:[];
      var tailA=a.rows?sh.getRange(a.rows,1,1,n).getDisplayValues()[0]:[];
      var tailB=b.rows?dst.getRange(b.rows,1,1,n).getDisplayValues()[0]:[];
      var same=a.rows===b.rows&&a.columns===b.columns&&
        JSON.stringify(headA)===JSON.stringify(headB)&&JSON.stringify(tailA)===JSON.stringify(tailB);
      (same?report.matched:report.mismatched).push({name:name,source:a,destination:b});
    }catch(e){report.errors.push({name:name,error:String(e)});}
  });
  report.ready=report.unmapped.length===0&&report.errors.length===0&&report.mismatched.length===0;
  return report;
}
