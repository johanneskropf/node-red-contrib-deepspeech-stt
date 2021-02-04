# node-red-contrib-deepspeech-stt
A node-red node for speech to text inference using [mozillas deepspeech](https://deepspeech.readthedocs.io/en/latest/index.html).

This node uses the official [deepspeech](https://deepspeech.readthedocs.io/en/latest/index.html) node.js client implementation. So just install the node from your node-red folder (normally `~/.node-red`) with
```
npm install johanneskropf/node-red-contrib-deepspeech-stt
```
and deepspeech will be automatically installed as a dependency.
The node uses deepspeech 0.9.3 or later. To do speech to text inference you need to download a model and a scorer file. For example [the official english or chinese model](https://github.com/mozilla/DeepSpeech/releases/tag/v0.9.3) can be found on the release page.
You need to enter the path to both the model and the scorer in the nodes config.
To do inference then send a wav buffer (16000Hz, 16bit, mono) to the nodes input in the configured `msg` input property. 
You will receive the transcription, input length and inference time as an object in the `msg.payload` or in your configured output property.
If you want to do more accurate and quicker transcriptions of a limited vocabulary and sentences set you will need to train your own scorer file. [Documentation on how to do this can be found in the deepspeech readme](https://deepspeech.readthedocs.io/en/latest/Scorer.html#scorer-scripts).
