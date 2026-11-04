/** Quote Job List -> company calendar. Financial document numbers stay independent. */
var QUOTE_JOB_LIST_ID_='1Kz4shFHxg5XzCGqsj68TEFEszbVooemi5AEhfklvVPs';
function quoteJobCompany_(value){
  var key=String(value||'').toLowerCase().replace(/[^a-z]/g,'');
  return key==='hiservice'?'Hi Service':key==='flagship'||key==='flagshipsolar'?'Flagship Solar':'';
}
function quoteJobNumber_(value){
  var no=String(value==null?'':value).trim();
  if(!/^[0-9]{1,12}$/.test(no))throw Error('A numeric Quote Job List job number is required');
  return no;
}
function quoteJobBookingId_(company,no){return 'qjl-'+(company==='Hi Service'?'hi':'fs')+'-'+quoteJobNumber_(no)+'-sitevisit';}
function quoteJobLookup_(no,company){
  no=quoteJobNumber_(no);
  var sh=SpreadsheetApp.openById(QUOTE_JOB_LIST_ID_).getSheetByName('Sheet1');
  if(!sh||sh.getLastRow()<2)throw Error('Quote Job List has no jobs');
  var rows=sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getDisplayValues(),headers=rows.shift();
  function column(name){var index=headers.indexOf(name);if(index<0)throw Error('Quote Job List is missing '+name);return index;}
  var numberCol=column('Job No'),companyCol=column('Company Name');
  var found=rows.filter(function(r){return String(r[numberCol]).trim()===no;});
  if(!found.length)throw Error('Job '+no+' was not found on the active Quote Job List');
  if(found.length!==1)throw Error('Duplicate job number '+no+' on Quote Job List; correct the list first');
  var row=found[0];
  if(quoteJobCompany_(row[companyCol])!==company)throw Error('This job belongs to another company. Open the current company link on the job list.');
  var phone=row[column('Contact Number')]||'';if(/^[1-9][0-9]{8}$/.test(phone))phone='0'+phone;
  var job={jobNo:no,company:company,customer:row[column('Client Name')],site:row[column('Address')],description:row[column('Description')],phone:phone,email:row[column('Email Address')],rep:row[column('Rep')],jobListId:QUOTE_JOB_LIST_ID_,bookingId:quoteJobBookingId_(company,no),jobType:'Site Visit'};
  if(!job.customer)throw Error('Enter the client name on the Quote Job List first');
  job.notes=[job.description,job.phone?'Contact: '+job.phone:'',job.email?'Email: '+job.email:''].filter(Boolean).join('\n');
  return job;
}
function quoteJobRead_(body){
  var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician']);
  if(!permissionAllowed_(u,company,'calendar.edit')||!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar scheduling and view permission required');
  var job=quoteJobLookup_(body.jobNo,company),bookings=workCalendarList_(u,company,{bookingId:job.bookingId});
  return {ok:true,job:job,booking:bookings[0]||null};
}
function quoteJobBindBooking_(input,company){
  if(!input.jobListId){if(/^qjl-/.test(String(input.id||'')))throw Error('Quote Job List reference is required');return input;}
  if(input.jobListId!==QUOTE_JOB_LIST_ID_)throw Error('Unknown job list');
  var job=quoteJobLookup_(input.jobNo,company);
  if(input.id!==job.bookingId)throw Error('Job booking ID does not match the Quote Job List');
  // Resolve these fields on the server so an old browser tab cannot cross companies.
  return Object.assign({},input,{customer:job.customer,site:job.site,jobNo:job.jobNo,jobType:'Site Visit',jobListId:QUOTE_JOB_LIST_ID_});
}
