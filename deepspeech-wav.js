/**
 * Copyright 2021 Johannes Kropf
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

module.exports = function(RED) {
    
    const deepspeech = require("deepspeech");
    const metadata = require("music-metadata");
    const fs = require("fs");
    
    function deepspeechWavNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.modelPath = config.modelPath;
        this.scorerPath = config.scorerPath;
        this.inputProp = config.inputProp;
        this.outputProp = config.outputProp;
        this.errorStop = false;
        this.statusTimer = false;
        
        var node = this;
        
        function node_status(state1 = [], timeout = 0, state2 = []){
            
            if (state1.length !== 0) {
                node.status({fill:state1[1],shape:state1[2],text:state1[0]});
            } else {
                node.status({});
            }
            
            if (node.statusTimer !== false) {
                clearTimeout(node.statusTimer);
                node.statusTimer = false;
            }
            
            if (timeout !== 0) {
                node.statusTimer = setTimeout(() => {
                
                    if (state2.length !== 0) {
                        node.status({fill:state2[1],shape:state2[2],text:state2[0]});
                    } else {
                        node.status({});
                    }
                    
                    node.statusTimer = false;
                    
                },timeout);
            }
        }
        
        async function checkBuffer (buffer) {
            
            const audioMeta = await metadata.parseBuffer(buffer, "audio/wav").catch(error => {
                (done) ?
                done(`Couldn't check the buffer validity, are you sure it was a wav audio buffer?: ${error}`) :
                node.error(`Couldn't check the buffer validity, are you sure it was a wav audio buffer?: ${error}`);
                node_status(["error","red","dot"]);
                return;
            });
            return audioMeta;
            
        }
        
        if (!fs.existsSync(node.modelPath)) {
            node.error(`error: ${node.modelPath} does not exist`);
            node.errorStop = true;
            node_status(["error","red","dot"]);
        }
        if (!fs.existsSync(node.scorerPath)) {
            node.error(`error: ${node.scorerPath} does not exist`);
            node.errorStop = true;
            node_status(["error","red","dot"]);
        }
        if (!node.errorStop) {
            try {
                node.decoder = new deepspeech.Model(node.modelPath);
                node.decoder.enableExternalScorer(node.scorerPath);
            } catch (error) {
                node.error(`decoder error: ${error}`);
                node.errorStop = true;
                node_status(["error","red","dot"]);
            }
        } else {
            node.error("The node needs the path to a valid model and scorer.");
            node_status(["error","red","dot"]);
        }
        
        node.on('input', function(msg,send,done) {
            
            if (node.errorStop) {
                node.warn("ignoring as not properly setup, please look at any errors thrown during start up");
                if (done) { done(); }
                return;
            }
            
            let transcription = {};
            const inputTime = Date.now();
            
            const input = RED.util.getMessageProperty(msg, node.inputProp); 
            
            if (!Buffer.isBuffer(input)) {
                node.warn("non buffer payload will be ignored");
            } else {
                
                node_status(["inference in progress...","blue","dot"]);
                
                checkBuffer(input).then((meta) => {
                    if (meta.format.bitsPerSample !== 16) {
                        (done) ?
                        done("error: wav wasn't 16 bit per sample") :
                        node.error("error: wav wasn't 16 bit per sample");
                        node_status(["error","red","dot"]);
                        return;
                    }
                    if (meta.format.sampleRate !== 16000) {
                        (done) ?
                        done("error: wav sample rate wasn't 16000Hz") :
                        node.error("error: wav sample rate wasn't 16000Hz");
                        node_status(["error","red","dot"]);
                        return;
                    }
                    if (meta.format.numberOfChannels !== 1) {
                        (done) ?
                        done("error: wav channels weren't 1") :
                        node.error("error: wav channels weren't 1");
                        node_status(["error","red","dot"]);
                        return;
                    }
                    
                    try {
                        transcription.text = node.decoder.stt(msg.payload);
                        transcription.audioDuration = meta.format.duration;
                        transcription.inferenceDuration = (Date.now()-inputTime)/1000;
                        msg[node.outputProp] = transcription;
                        (send) ? send(msg) : node.send(msg);
                        node_status(["inference done","green","dot"],1500);
                    } catch (error) {
                        (done) ?
                        done(`Transcription failed ${error}`) :
                        node.error(`Transcription failed ${error}`);
                        node_status(["error","red","dot"]);
                        return;
                    }
                  
                }).catch((error) => {
                    (done) ?
                    done(error) :
                    node.error(error);
                    node_status(["error","red","dot"]);
                    return;
                });
                
            }
            
            if (done) { done(); }
            return;
            
        });
        
        node.on("close",function() {
            if (node.statusTimer) { clearTimeout(node.statusTimer); }
            node.statusTimer = false;
            node.status({});
            if (node.decoder) {
                node.decoder = null;
            }
        });
        
    }
    RED.nodes.registerType("deepspeech-wav",deepspeechWavNode);
}