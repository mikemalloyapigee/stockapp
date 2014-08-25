var config = require('./config');
var ug = require('./ug');
var _ = require('underscore');
var request = require("request");
var volos = require('./volos');

var cache = volos.Cache.create('stockapp', {ttl: 300000,
  encoding: 'utf8',
  encryptionKey: 'abc123'
  });
function getStockKey(req){return req.user.id + "stockdata";}
function getSummaryKey(req){return req.user.id + "summary";}


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
    } else {next();}
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
    } else {next();}
  });
}
exports.checkTradeLimit = checkTradeLimit;


function initializePortfolio(req, res, cb){  
  console.log("Getting portfolio " + req.user.id );
  var options = ug.getUsergridOptions(req);
  ug.client.getEntity(options, function(err, entity, data){
    if(entity.get('uuid') === undefined){createNewAccount(req, function(ent){cb(ent);} );}
    else{cb(entity);}
  });
}

function getPortfolio(req, res, cb){  
  console.log("Getting portfolio " + req.user.id );
  var options = ug.getUsergridOptions(req);
  ug.client.getEntity(options, function(err, entity, data){
    if(err){console.log("Error getting portfolio"); cb(null);}
    else {cb(entity);}
  });
}
exports.getPortfolio = getPortfolio;

function getStockData(req, res, cb){
  var key = getStockKey(req);
  cache.get(key, function(err, reply){
    if(reply){
      console.log("Stock data cache hit");
      cb(JSON.parse(reply));
    } else {
      getPortfolio(req, res, function(port){
        var stocks = port.get('stocks');
        updatePortfolio(stocks, function(portfolio){
            cache.set(key, portfolio);
            cb(JSON.parse(portfolio));
        });
      });
    }
  });
}
exports.getStockData = getStockData;

function getSummaryData(req, res, cb){
  var key = getSummaryKey(req);
  cache.get(key, function(err, reply){
    if(reply){
      console.log("Summary Data cache hit");
      cb(JSON.parse(reply));
    } else {
      console.log("Cache miss for summary data");
      getStockData(req, res, function(portfolio){
          summarizePortfolio(JSON.stringify(portfolio), function(summary){
            cache.set(key, summary);
            cb(JSON.parse(summary));
          });
        }); 
    }
  });
}
exports.getSummaryData = getSummaryData;


function createNewAccount(req, cb){
  var opts = ug.getUsergridOptions(req);
  ug.client.createEntity(opts, function(err, o){
    if(err){console.log(err); return;}
    o.set({"display_name": req.user.displayName, "stocks":{"AAPL":{"shares":25},"MSFT":{"shares":100},"GOOG":{"shares":150}}});
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

function savePortfolio(req, stock_data, summary, cb){
  var opts = ug.getUsergridOptions(req);
  ug.client.getEntity(opts, function(err, entity, data){
    entity.set({"stocks":stock_data, "summary":summary});
    entity.save(function(err){
      if(err){console.log("Error saving portfolio: "+ err);}
      else{
        cache.set(getStockKey(req), stock_data);
        cache.set(getSummaryKey(req), summary);
        console.log("Saved portfolio");
        cb();
      }
    });
  });
}

exports.setupPortfolio = function(req, res){
  initializePortfolio(req, res, function(entity){
    stock_data = entity.get('stocks');
    updatePortfolio(stock_data, function(port){
      summarizePortfolio(port, function(summary){
        savePortfolio(req, port, summary, function(){
          res.redirect("/summary");
        });
      });
    });
  });  
}

exports.sellStock = function(req, res){
  var ticker = (req.body.ticker).toUpperCase();
  var number = Number(req.body.shares);
  cache.delete(getStockKey(req), function(err, reply){});
  cache.delete(getSummaryKey(req), function(err, reply){});
  getStockData(req, res, function(stock_data){
    var stock = stock_data[ticker];
    if(stock !== undefined){
      stock["shares"] = stock["shares"] - number;
      if(stock["shares"] < 0){stock["shares"] = 0;}
      stock_update = JSON.stringify(stock_data);
      updatePortfolio(stock_update, function(port){
        summarizePortfolio(port, function(summary){
          savePortfolio(req, port, summary, function(){
            res.redirect("/summary");
          });
        });
      });
    }
  });
}

exports.buyStock = function(req,res){
  var ticker = (req.body.ticker).toUpperCase().replace(/\ /g, '');
  var number = Number(req.body.shares);
  //invalidate the cache
  cache.delete(getStockKey(req), function(err, reply){});
  cache.delete(getSummaryKey(req), function(err, reply){});
  getStockData(req, res, function(stock_data){
    if(stock_data[ticker] === undefined){
      stock_data[ticker] = {};
      stock_data[ticker]["shares"] = number;
    } else {
      stock_data[ticker]["shares"] = stock_data[ticker]["shares"] + number;
    }
    stock_update = JSON.stringify(stock_data);
    updatePortfolio(stock_update, function(port){
      summarizePortfolio(port, function(summary){
        savePortfolio(req, port, summary, function(){
          res.redirect("/summary");
        });
      });
    });
  });
}

function getQuotes(ticker_symbols, cb){
  var ticker_string = "(";
  for(var i=0; i<ticker_symbols.length; i++){
    ticker_string = ticker_string + "\"" + ticker_symbols[i] + "\"";
    if(i<ticker_symbols.length-1){ticker_string = ticker_string + ",";}
  }
  ticker_string = ticker_string + ")";
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
      cb(quotes);
    }
  });
}
exports.getQuotes = getQuotes;


function updatePortfolio(stock_data, cb){
  var ticker_symbols = _.keys(JSON.parse(stock_data));
  getQuotes(ticker_symbols, function(quotes){
    var s_data = JSON.parse(stock_data);
    var retval = {}
    _.each(quotes, function(quote){  
      var ticker = quote.Symbol;
      var shares = Number(s_data[ticker].shares);
      var value = (Number(quote.LastTradePriceOnly) * shares).toFixed(2);
      if(value > 0.00){
        retval[ticker] = {};
        retval[ticker]["name"] = quote.Name;
        retval[ticker]["shares"] = shares;
        retval[ticker]["price"] = Number(quote.LastTradePriceOnly).toFixed(2);
        retval[ticker]["change"] = (Number(quote.Change) * shares).toFixed(2);
        retval[ticker]["current_value"] = value;
      }
    });
    cb(JSON.stringify(retval));
  });
} 

function summarizePortfolio(port, cb){
  console.log("summarizing portfolio")
  var portfolio = JSON.parse(port);
  var keys = _.keys(portfolio);
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
