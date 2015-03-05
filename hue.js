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
	
	var userDir="";
	if (RED.settings.userDir){
		userDir=RED.settings.userDir+"/";
	} 
	
	fs.readFile(userDir+'hue.config', function (err, data) {
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
			if (that.deviceid.indexOf("g-")==0){
				api.getGroup(that.deviceid.substring(2),function(err, result) {
					if (err){
						that.send([null,{payload:err}]);
					} else {
						that.send([{payload:result.lastAction},null]);
					}
				});
			} else {
					api.lightStatus(that.deviceid, function(err, result) {
					if (err){
						that.send([null,{payload:err}]);
					} else {
						that.send([{payload:result},null]);
					}
				});
			}
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
	
	RED.httpAdmin.get('/philipshue/server', function(req, res, next){
		hue.nupnpSearch(function(err, result) {
			if (err) throw err;
			upnpresult=result;
			res.end(JSON.stringify(result));
		});
		return;
	});
	RED.httpAdmin.get('/philipshue/devices/:serverid', function(req, res, next){
		var returnDevices=function(){
			var api=new hue.HueApi(ip,config[req.params.serverid]);
			api.getFullState(function(err, config) {
				if (err) throw err;
				res.end(JSON.stringify({lights:config.lights,groups:config.groups}));
			});	
		}
		
		var ip=getIpForServer(req.params.serverid);
		if(typeof(config[req.params.serverid])==="undefined"){
			(new hue.HueApi()).createUser(ip, null, "Node RED", function(err, user) {
				if (err!=null){
					res.end(JSON.stringify({error:1}));
					return;
				}
				config[req.params.serverid]=user;
				fs.writeFile(userDir+"hue.config",JSON.stringify(config));
				returnDevices();
			});
		} else {
			returnDevices();
		}		
	});
    
	
}
