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
        this.advanced = config.showAdvanced;
        this.enableBeamwidth = (config.showAdvanced) ? config.enableBeamwidth : false;
        this.beamWidth = config.beamWidth;
        this.enableAlphaBeta = (config.showAdvanced) ? config.enableAlphaBeta : false;
        this.lmAlpha = config.lmAlpha;
        this.lmBeta = config.lmBeta;
        this.disableScorer = (config.showAdvanced) ? config.disableScorer : false;
        this.inputProp = config.inputProp;
        this.outputProp = config.outputProp;
        this.hotwordList = [];
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
        if (!fs.existsSync(node.scorerPath) && !node.disableScorer) {
            node.error(`error: ${node.scorerPath} does not exist`);
            node.errorStop = true;
            node_status(["error","red","dot"]);
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
            
            let transcription = {};
            const inputTime = Date.now();
            
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
                                hotwords = hotwords + item.word + ", ";
                            }
                        });
                        hotwords = hotwords.substring(0, hotwords.length - 2);
                        node.warn(`added the following words to the hotwords list: ${hotwords} (to clear hotwords send an empty array)`);
                    }
                    if (done) { done(); }
                    return;
                }
                node.warn("non buffer payload will be ignored");
                
            } else {
                
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
                        node_status(["inference in progress...","blue","dot"]);
                        setTimeout(() => {
                            transcription.text = node.decoder.stt(input);
                            transcription.audioDuration = meta.format.duration;
                            transcription.inferenceDuration = (Date.now()-inputTime)/1000;
                            msg[node.outputProp] = transcription;
                            (send) ? send(msg) : node.send(msg);
                            node_status(["inference done","green","dot"],1500);
                        },50);
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
                try {
                    deepspeech.FreeModel(node.decoder);
                    node.decoder = null;
                } catch (error) {
                    node.error(`couldnt clean up deepspeech: ${error}`)
                }
            }
        });
        
    }
    RED.nodes.registerType("deepspeech-wav",deepspeechWavNode);
}