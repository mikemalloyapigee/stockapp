var config = require('./config');
var ug = require('./ug');
var _ = require('underscore');
var request = require("request");
var volos = require('./volos');

var cache = volos.Cache.create('stockapp', {ttl: 30000,
  encoding: 'utf8',
  encryptionKey: 'abc123'
  });

var quota = volos.Quota.create({timeUnit: 'day',
  interval: 1,
  allow: 5
  });

function enforceTradeLimit(req, resp, next) {
  var hit = { identifier: req.user.id, weight: 1 };
  quota.apply(hit, function(err, result) {

    console.log('Quota: %s', JSON.stringify(result));
    if (err) { return next(err); }
    if (!result.isAllowed) {
        msg = "You have exceeded your trade limit for the day.  Your trade did not go through";
        resp.render("error_page", {error_message: msg});
    }
    next();
  });
}
exports.enforceTradeLimit = enforceTradeLimit;

function checkTradeLimit(req, resp, next) {
  var hit = { identifier: req.user.id, weight: 0 };
  quota.apply(hit, function(err, result) {
    if (err) { return next(err); }
    if (!result.isAllowed) {
      msg = "You have exceeded your trade limit for the day.";
      resp.render("error_page", {error_message: msg});
    }
    next();
  });
}
exports.checkTradeLimit = checkTradeLimit;

function getUsergridOptions(req){
  return {'type':config.USERGRID_COLLECTION, 'name': req.user.id}
}

function initializePortfolio(req, res, cb){  
  console.log("Getting portfolio " + req.user.id );
  var options = getUsergridOptions(req);
  ug.client.getEntity(options, function(err, entity, data){
    if(entity.get('uuid') === undefined){createNewAccount(req, function(ent){cb(ent);} );}
    else{cb(entity);}
  });
}

function getPortfolio(req, res, cb){  
  console.log("Getting portfolio " + req.user.id );
  var options = getUsergridOptions(req);
  ug.client.getEntity(options, function(err, entity, data){
    if(err){console.log("Error getting portfolio"); cb(null);}
    else {cb(entity);}
  });
}
exports.getPortfolio = getPortfolio;

function getStockData(req, res, cb){
  var key = req.user.id + "stockdata";
  cache.get(key, function(err, reply){
    if(reply){cb(JSON.parse(reply));}
    else {
      getPortfolio(req, res, function(port){
        var stocks = port.get('stocks');
        cache.set(key, stocks);
        cb(JSON.parse(stocks));
      });
    }
  });
}
  
exports.getStockData = getStockData;

function getSummaryData(req, res, cb){
  var key = req.user.id + "summary";
  cache.get(key, function(err, reply){
    if(reply){cb(JSON.parse(reply));}
    else {
      getPortfolio(req, res, function(port){
        var summary = port.get('summary');
        cache.set(key, summary);
        cb(JSON.parse(summary));
      });
    }
  });
}
exports.getSummaryData = getSummaryData;


function createNewAccount(req, cb){
  var opts = getUsergridOptions(req);
  ug.client.createEntity(opts, function(err, o){
    if(err){console.log(err); return;}
    o.set({"display_name": req.user.displayName, "stocks":{"AAPL":{"shares":25, "name":"Apple Inc."},"MSFT":{"shares":100, "name":"Microsoft"},"GOOG":{"shares":150, "name":"Google Inc."}}});
    o.save(function(err){
      if(err){
        console.log("Error while saving: " + err); 
      }
      else {
        console.log("Saved new account");
        cb(o);
      }
    });
  });
}

function savePortfolio(req, stock_data, summary){
  var opts = getUsergridOptions(req);
  ug.client.getEntity(opts, function(err, entity, data){
    entity.set({"stocks":stock_data, "summary":summary});
    entity.save(function(err){
      if(err){console.log("Error saving portfolio: "+ err);}
      else{
        var stock_key = req.user.id + "stockdata";
        var summary_key = req.user.id + "summary";
        cache.set(stock_key, stock_data);
        cache.set(summary_key, summary);
        console.log("Updated portfolio");
      }
    });
  });
}

exports.setupPortfolio = function(req, res){
  initializePortfolio(req, res, function(entity){
      console.log("got stock data");
      stock_data = entity.get('stocks');
      updatePortfolio(stock_data, function(port){
        summarizePortfolio(port, function(summary){
          savePortfolio(req, port, summary);
          res.render("summary", JSON.parse(summary));
          });
        });
  });
}

exports.sellStock = function(req, res){
  var ticker = (req.body.ticker).toUpperCase();
  var number = Number(req.body.shares);
  var stock_key = req.user.id + "stockdata";
  var summary_key = req.user.id + "summary";
  cache.delete(stock_key, function(err, reply){});
  cache.delete(summary_key, function(err, reply){});
  getStockData(req, res, function(stock_data){
    var stock = stock_data[ticker];
    stock["shares"] = stock["shares"] - number;
    if(stock["shares"] < 0){stock["shares"] = 0;}
    stock_update = JSON.stringify(stock_data);
    updatePortfolio(stock_update, function(port){
      summarizePortfolio(port, function(summary){
        savePortfolio(req, port, summary);
        res.render("summary", JSON.parse(summary));
        });
      });
  });
}

exports.buyStock = function(req,res){
  var ticker = (req.body.ticker).toUpperCase();
  var number = Number(req.body.shares);
  //invalidate the cache
  var stock_key = req.user.id + "stockdata";
  var summary_key = req.user.id + "summary";
  cache.delete(stock_key, function(err, reply){});
  cache.delete(summary_key, function(err, reply){});
  getStockData(req, res, function(stock_data){
    var stock = stock_data[ticker];
    if(stock === undefined){
      stock_data[ticker] = {};
      stock_data[ticker]["shares"] = number;
    } else {
      stock["shares"] = stock["shares"] + number;
    }
    stock_update = JSON.stringify(stock_data);
    updatePortfolio(stock_update, function(port){
      summarizePortfolio(port, function(summary){
        savePortfolio(req, port, summary);
        res.render("summary", JSON.parse(summary));
        });
      });
  });
}


function updatePortfolio(stock_data, cb){
  var ticker_symbols = _.keys(JSON.parse(stock_data));
  var ticker_string = "(";
  for(var i=0; i<ticker_symbols.length; i++){
    ticker_string = ticker_string + "\"" + ticker_symbols[i] + "\"";
    if(i<ticker_symbols.length-1){ticker_string = ticker_string + ",";}
  }
  ticker_string = ticker_string + ")";
  console.log("Ticker string: " + ticker_string);
  encoded_ticker_string = encodeURIComponent(ticker_string);
  yqlstart="https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20yahoo.finance.quote%20where%20symbol%20in%20"
  end_str="&format=json&diagnostics=true&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback="
  yql = yqlstart + encoded_ticker_string + end_str;
  console.log("yql: "+ yql);
  request(yql, function(error,response,body){
    if(error){console.log("Error getting stock data");}
    else { 
      var yresults = JSON.parse(body);
      var quotes = yresults.query.results.quote; 
      var days_results = JSON.parse(stock_data);
      
      for(var i=0; i<quotes.length; i++){  
        var ticker = quotes[i].Symbol;
        console.log(days_results[ticker]);
        days_results[ticker]["name"] = quotes[i].Name;
        days_results[ticker]["price"] = Number(quotes[i].LastTradePriceOnly).toFixed(2);
        days_results[ticker]["change"] = Number(quotes[i].Change * days_results[ticker].shares).toFixed(2);
        days_results[ticker]["current_value"] = Number(quotes[i].LastTradePriceOnly * days_results[ticker].shares).toFixed(2);
        
      }
      cb(JSON.stringify(days_results));
    }
  });
}  

function summarizePortfolio(port, cb){
  console.log("summarizing portfolio")
  var portfolio = JSON.parse(port);
  var keys = _.keys(portfolio);
  console.log("keys:\n" + keys);
  console.log("port:\n" + portfolio);
  var total_value = _.reduce(keys, function(memo, key){return memo + Number(portfolio[key]["current_value"]);}, 0);
  var total_change = _.reduce(keys, function(memo, key){return memo + Number(portfolio[key]["change"])}, 0);
  var max_change = _.max(keys, function(key){return Number(portfolio[key]["change"]);});
  var biggest_gain;
  if(portfolio[max_change]["change"] > 0){biggest_gain = {"name":max_change, "change":Number(portfolio[max_change]["change"]).toFixed(2)};}
  var min_change = _.min(keys, function(key){return Number(portfolio[key]["change"]);});
  var biggest_loser;
  if(portfolio[min_change]["change"] < 0){biggest_loser = {"name":min_change, "change":Number(portfolio[min_change]["change"]).toFixed(2)};}
  retVal = {"value":Number(total_value).toFixed(2), "change":Number(total_change).toFixed(2)}
  if(biggest_gain){retVal["biggest_gain"] = biggest_gain;}
  if(biggest_loser){retVal["biggest_loss"] = biggest_loser;}
  cb(JSON.stringify(retVal));
}
