var portfolio = require("../portfolio");
var _ = require("underscore");


exports.index = function(req, res){
  if(req.user === undefined){
    res.render('index');
  } else {
    res.redirect("/summary");
  }
  
};

exports.summary = function(req, res){
  var port;
  portfolio.getSummaryData(req, res, function(summary){
    res.render('summary', summary);
  });
  
}

exports.show_buy_form = function(req, res){
  res.render('buy');
}

exports.show_sell_form = function(req, res){
  res.render('sell');
}

exports.view_portfolio = function(req, res){
  portfolio.getStockData(req, res, function(stocks){
    var keys = _.keys(stocks);
    var stock_list = _.map(keys, function(key){return {ticker:key, name:stocks[key]["name"], shares:stocks[key]["shares"], price:stocks[key]["price"], value:stocks[key]["current_value"], change:stocks[key]["change"]}})
    res.render('portfolio', {stocks: stock_list});
  });
}