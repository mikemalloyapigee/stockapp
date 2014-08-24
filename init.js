/****************************************************************************
 The MIT License (MIT)

 Copyright (c) 2013 Apigee Corporation

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
'use strict';

exports.createApp = createApp;
exports.createToken = createToken;
var _ = require("underscore");

function createApp(cb) {

  var volos = require('./volos');
  var config = require('./config');
  var management = volos.Management.create(_.extend({ encryptionKey: 'abc123'}, config.redisConfig) );

  var devRequest = {
    firstName: 'Mike',
    lastName: 'Malloy',
    email: 'mmalloy@apigee.com',
    userName: 'mmalloy'
  };

  management.deleteDeveloper(devRequest.email, function() {

    console.log('Creating developer %s', devRequest.userName);
    management.createDeveloper(devRequest , function(err, developer) {
      if (err) { throw err; }

      var appRequest = { name: 'Stock App', developerId: developer.id };
      console.log('Creating application %s for developer %s', appRequest.name, developer.id);

      management.createApp(appRequest, function(err, app) {
        if (err) { throw err; }
        cb(app);
      });
    });
  });
}


function tokenGenerator(app, oauth, cb) {
  var request = {
      grant_type: 'client_credentials',
      client_id: app.credentials[0].key,
      client_secret: app.credentials[0].secret
  };
  oauth.generateToken(request, function(err, reply) {
      var token = reply.access_token;
      request.accessToken = token;
      cb(request);
  });
}
exports.tokenGenerator = tokenGenerator;
