/**
 * Copyright 2015 Urbiworx.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var urllib = require("url");
var fs = require("fs");
var hue = require("node-hue-api");

module.exports = function(RED) {
    "use strict";
	var upnpresult=new Array();
	var config=null;
	
	fs.readFile('./hue.config', function (err, data) {
		if (err!=null){
			config={};
			return;
		}
		config=JSON.parse(data);
	});
	hue.nupnpSearch(function(err, result) {
		if (err) throw err;
		upnpresult=result;
	});
	
    function HueNodeOut(n) {
        RED.nodes.createNode(this,n);
		var that=this;
		this.deviceid=n.deviceid;
		this.serverid=n.serverid;
		this.ip=getIpForServer(this.serverid);
		this.on("input",function(msg) {
			if (!that.ip){
				that.ip=getIpForServer(this.serverid);
			}
			var api=new hue.HueApi(that.ip,config[that.serverid]);
			api.lightStatus(that.deviceid, function(err, result) {
				if (err){
					that.send([null,{payload:err}]);
				} else {
					that.send([{payload:result},null]);
				}
			});
		});
    }
    RED.nodes.registerType("Hue Pull",HueNodeOut);
	
	function HueNodeSet(n) {
        RED.nodes.createNode(this,n);
		var that=this;
		this.deviceid=n.deviceid;
		this.serverid=n.serverid;
		this.ip=getIpForServer(this.serverid);
		this.on("input",function(msg) {
			if (!that.ip){
				that.ip=getIpForServer(this.serverid);
			}
			var api=new hue.HueApi(that.ip,config[that.serverid]);
			var lightState=hue.lightState.create();
			for (var item in msg.payload){
				lightState=lightState[item].apply(lightState,msg.payload[item]);
			}
			var resultFunction=function(err, lights) {
				if (err){
					that.send([null,{payload:err}]);
				} else {
					that.send([{payload:lights},null]);
				}
			}
			if (that.deviceid.indexOf("g-")==0){
				api.setGroupLightState(that.deviceid.substring(2),lightState,resultFunction);
			} else {
				api.setLightState(that.deviceid,lightState,resultFunction);
			}
		});
    }
	RED.nodes.registerType("Hue Set",HueNodeSet);
	
	function getIpForServer(server){
		for (var i=0;i<upnpresult.length;i++){
			if(upnpresult[i].id===server){
				return upnpresult[i].ipaddress;
			}
		}
	}
    function callback(req,res) {
		try{
			var reqparsed=urllib.parse(req.url, true);
			
			if (reqparsed.query.server==="true"){
				hue.nupnpSearch(function(err, result) {
					if (err) throw err;
					upnpresult=result;
					res.end(JSON.stringify(result));
				});
				return;
			} 
			else if (typeof(reqparsed.query.devices)!=="undefined"){
				var returnDevices=function(){
					var api=new hue.HueApi(ip,config[reqparsed.query.devices]);
					api.getFullState(function(err, config) {
						if (err) throw err;
						res.end(JSON.stringify({lights:config.lights,groups:config.groups}));
					});	
				}
				
				var ip=getIpForServer(reqparsed.query.devices);
				if(typeof(config[reqparsed.query.devices])==="undefined"){
					(new hue.HueApi()).createUser(ip, null, "Node RED", function(err, user) {
						if (err!=null){
							res.end(JSON.stringify({error:1}));
							return;
						}
						config[reqparsed.query.devices]=user;
						fs.writeFile("./hue.config",JSON.stringify(config));
						returnDevices();
					});
				} else {
					returnDevices();
				}
				
			}
			else {	
				res.end("");
			}
		} catch (e) {console.log(e);res.end("");}
	}
	function errorHandler(err,req,res,next) {
	        res.end(JSON.stringify(err));
           
	};
	function corsHandler(req,res,next) { next(); }
	
	RED.httpNode.get("/philipshue",corsHandler,callback,errorHandler);

	
}
