var usergrid = require('usergrid');

var client = new usergrid.client({
    'orgName':"MIKE.MALLOY",
    'appName': "STOCKAPP",
    "clientId" : "b3U6PhMyOiOsEeSrWrHM8FuiuQ",
    "clientSecret" : "b3U6ViIGc_QC3FZANaSTvfGFuPx0x94"
});

client.login("testuser", "Apigee127", function(err, data, user){ if(err){console.log(err);}});


exports.client=client


