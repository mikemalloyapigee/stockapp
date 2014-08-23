module.exports = {
"FACEBOOK_APP_ID" : "300823363429881",
"FACEBOOK_SECRET" : "4f6479613bb155db70bf7927845f1029",

//Usergrid
"USERGRID_USER" : "mmalloy",
"USERGRID_PASSWORD" : "Apigee127",
"USERGRID_APP" : "stockapp",
"USERGRID_ORG" : "mike.malloy",
"USERGRID_COLLECTION" : "accounts",

//Redis
"redisConfig" : {
 
},

"oauth" : {
  
  "config": { encryptionKey: 'abc123'}
},

//App Specific
"CLIENT_ID" : "7JcU+m/hKBWBTCy1qP7IDq9m1Q3FgAQrOAHVeSfOOtA=",
"CLIENT_SECRET" : "n1KvMRxy57bW37/Mbr4Jt9XaJHp+s9CVuhTvmkCQwG4=",

 "oauth": {
    management: require('volos-management-redis'),
    provider: require('volos-oauth-redis')
  }
  
}