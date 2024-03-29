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
    const fs = require("fs");
    
    function deepspeechStreamNode(config) {
        
        RED.nodes.createNode(this,config);
        
        this.modelPath = config.modelPath;
        this.scorerPath = config.scorerPath;
        this.advanced = config.showAdvanced;
        this.enableBeamwidth = (config.showAdvanced) ? config.enableBeamwidth : false;
        this.beamWidth = config.beamWidth;
        this.enableAlphaBeta = (config.showAdvanced) ? config.enableAlphaBeta : false;
        this.lmAlpha = config.lmAlpha;
        this.lmBeta = config.lmBeta;
        this.disableScorer = (config.showAdvanced) ? config.disableScorer : false;
        this.finalTimeout = config.finalTimeout;
        this.inputProp = config.inputProp;
        this.outputProp = config.outputProp;
        this.hotwordList = [];
        this.errorStop = false;
        this.statusTimer = false;
        this.inputTimeout = false;
        
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
        
        function inputTimeoutTimer(){
            if (node.inputTimeout !== false) {
                clearTimeout(node.inputTimeout);
                node.inputTimeout = false;
            }
            node.inputTimeout = setTimeout(() => {
                let msg = {};
                let transcription = {};
                transcription.text = node.streamDecoder.finishStream();
                msg[node.outputProp] = transcription;
                node.send(msg);
                node.streamDecoder = null;
                node_status(["inference done","green","dot"],1500);
                node.inputTimeout = false;
            }, node.finalTimeout);
        }
        
        if (!fs.existsSync(node.modelPath)) {
            node.error(`error: ${node.modelPath} does not exist`);
            node.errorStop = true;
            node_status(["error","red","dot"]);
        }
        if (!fs.existsSync(node.scorerPath) && !node.disableScorer) {
            node.error(`error: ${node.scorerPath} does not exist`);
            node.errorStop = true;
            node_status(["error","red","dot"]);
        }
        if (node.finalTimeout.match(/^[0-9]+$/g) === null) {
            node.error("timeout needs to be a valid int value");
            node.errorStop = true;
            node_status(["error","red","dot"]);
        } else {
            node.finalTimeout = parseInt(node.finalTimeout);
        }
        if (!node.errorStop) {
            try {
                node.decoder = new deepspeech.Model(node.modelPath);
                if (!node.disableScorer) { node.decoder.enableExternalScorer(node.scorerPath); }
                if (node.advanced) {
                    if (node.enableBeamwidth && node.beamWidth.length > 0 && node.beamWidth.match(/^[0-9]+$/g)) {
                        node.decoder.setBeamWidth(Number(node.beamWidth));
                    } else {
                        node.warn("ignoring beam width, needs to be a valid integer number value");
                    }
                    if (node.enableAlphaBeta && !node.disableScorer) {
                        if (node.lmAlpha.length > 0 && node.lmAlpha.match(/^[0-9]+[\.]?[0-9]*$/g) && node.lmBeta.length > 0 && node.lmBeta.match(/^[0-9]+[\.]?[0-9]*$/g)) {
                            node.decoder.setScorerAlphaBeta(Number(node.lmAlpha), Number(node.lmAlpha));
                        } else {
                            node.warn("ignoring alpha and beta values, both need to be set and need to be a valid floating point number value");
                        }
                    }
                }
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
            
            const input = RED.util.getMessageProperty(msg, node.inputProp); 
            
            if (!Buffer.isBuffer(input)) {
                
                if (Array.isArray(input)) {
                    if(input.length < 1) {
                        node.decoder.clearHotWords();
                        node.hotwordList = [];
                        node.warn("cleared all hotwords");
                    } else if (typeof input[0] === "object" && input[0].hasOwnProperty("word") && input[0].hasOwnProperty("boost")) {
                        let hotwords = "";
                        input.forEach(item => {
                            if (typeof item === "object" && item.hasOwnProperty("word") && item.hasOwnProperty("boost") && !node.hotwordList.includes(item.word)) {
                                node.decoder.addHotWord(item.word, item.boost);
                                node.hotwordList.push(item.word);
                                hotwords = `${hotwords}${item.word}(${item.boost}), `;
                            }
                        });
                        hotwords = hotwords.substring(0, hotwords.length - 2);
                        node.warn(`added the following words to the hotwords list: ${hotwords} (to clear hotwords send an empty array)`);
                    }
                    if (done) { done(); }
                    return;
                } else if (typeof input === "string") {
                    switch (input) {
                        case "stop":
                            if (node.streamDecoder){
                                try {
                                    if (node.inputTimeout !== false) {
                                        clearTimeout(node.inputTimeout);
                                        node.inputTimeout = false;
                                    }
                                    deepspeech.FreeStream(node.streamDecoder);
                                    node.streamDecoder = null;
                                } catch (error) {
                                    node.error(`couldnt clean up deepspeech stream: ${error}`)
                                }
                            } else {
                                node.warn("no inference in progress");
                            }
                            break;
                            
                        case "stop_result":
                            if (node.streamDecoder){
                                try {
                                    if (node.inputTimeout !== false) {
                                        clearTimeout(node.inputTimeout);
                                        node.inputTimeout = false;
                                    }
                                    let transcription = {};
                                    transcription.text = node.streamDecoder.finishStream();
                                    msg[node.outputProp] = transcription;
                                    (send) ? send(msg) : node.send(msg);
                                    node.streamDecoder = null;
                                    node_status(["inference done","green","dot"],1500);
                                } catch (error) {
                                    node.error(`couldnt clean up deepspeech stream: ${error}`)
                                }
                            } else {
                                node.warn("no inference in progress");
                            }
                            break;
                            
                        case "intermediate":
                            if (node.streamDecoder) {
                                let transcription = {};
                                transcription.text = node.streamDecoder.intermediateDecode();
                                msg[node.outputProp] = transcription;
                                (send) ? send(msg) : node.send(msg);
                            } else {
                                node.warn("no inference in progress");
                            }
                            break;
                    }
                }
                node.warn("non buffer / non control payload will be ignored");
                
            } else {
                
                if (!node.streamDecoder) {
                    node.streamDecoder = node.decoder.createStream();
                    node_status(["stream inference started...","blue","dot"]);
                }
                
                node.streamDecoder.feedAudioContent(input);
                if (node.finalTimeout !== 0) {
                    inputTimeoutTimer();
                }
                
            }
            
            if (done) { done(); }
            return;
            
        });
        
        node.on("close",function() {
            if (node.statusTimer) { clearTimeout(node.statusTimer); }
            node.statusTimer = false;
            node.status({});
            if (node.inputTimeout !== false) {
                clearTimeout(node.inputTimeout);
                node.inputTimeout = false;
            }
            if (node.streamDecoder){
                try {
                    deepspeech.FreeStream(node.streamDecoder);
                    node.streamDecoder = null;
                } catch (error) {
                    node.error(`couldnt clean up deepspeech stream: ${error}`)
                }
            }
            if (node.decoder) {
                try {
                    deepspeech.FreeModel(node.decoder);
                    node.decoder = null;
                } catch (error) {
                    node.error(`couldnt clean up deepspeech: ${error}`)
                }
            }
        });
        
    }
    RED.nodes.registerType("deepspeech-stream",deepspeechStreamNode);
}