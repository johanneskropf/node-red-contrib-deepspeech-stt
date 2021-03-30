# node-red-contrib-deepspeech-stt
A node-red node for speech to text inference from audio using [mozillas deepspeech](https://deepspeech.readthedocs.io/en/latest/index.html).

This suite of nodes uses the official [deepspeech](https://deepspeech.readthedocs.io/en/latest/index.html) node.js client cpu implementation.
So just install the node from the palette or your node-red folder (normally `~/.node-red`) with:
```
npm install node-red-contrib-deepspeech-stt
```
or directly from the repository with:
```
npm install johanneskropf/node-red-contrib-deepspeech-stt
```
(needs git installed)
and deepspeech will be automatically installed as a dependency.
The node uses deepspeech 0.9.3 or later. 

## Deepspeech-Wav Node
### Basic Usage

To do speech to text inference you need to download a model(**tflite**) and a corresponding scorer file.
For example [the official english or chinese model](https://github.com/mozilla/DeepSpeech/releases/tag/v0.9.3) can be found on the release page.
You need to enter the path to both the model and the scorer in the nodes config.
To do inference then send a wav buffer (16000Hz, 16bit, mono) to the nodes input in the configured `msg` input property. 
You will receive the transcription, input length and inference time as an object in the `msg.payload` or in your configured output property.
If you want to do more accurate and quicker transcriptions of a limited vocabulary and sentences set you will need to train your own scorer file.
[Documentation on how to do this can be found in the deepspeech readme](https://deepspeech.readthedocs.io/en/latest/Scorer.html#scorer-scripts).
For a list of some of the other available pre-trained models for different languages have a look in
[this thread on the mozilla deepspeech forum](https://discourse.mozilla.org/t/links-to-pretrained-models/62688).

### Advanced

The node exposes a number other settings from the deepspeech node.js api that can be used for changing the behaviour and tuning transcription speed and or results.

#### beam width

You can override the default beam width setting. The beamwidth influences how many options the deepspeech ctc beam search decoder explores while
transcribing the  audio. The higher the accuracy but the slower the transcription will become and vice versa. There is also a point of diminishing
returns if set too high. The default is 512. Set lower for faster results or higher to see if a higher accuracy can be achieved with the model and scorer used.

#### lm alpha & beta

Each scorer comes with default lm alpha (language model weight) and lm beta (word insertion penalty) values. You can override those values if you have a reason.
They are differnt for each scorer and the defaults are normally fairly well optimized.

#### disable external scorer

You can disable the use of an external scorer. This will give you the pure letter based predictions coming from the accoustic model.
They will most likely not be very accurate and slower.

#### hotwords

This is a recent feature added to deepspeech that allows you to increase the likelihood of certain words to appear in the transcription.
Each hotword is accompanied by a boost value (between -100 and 100, negative values decrease the likelihood of appearance).
A hotword should be a single word with no space that is part of the vocabulary used for the scorer. Most likely you wont need a value bigger than 10 to have a sufficient increase in propability for a single word. (using higher value can lead to detrimental results)
You can add hotwords to the deepspeech node in node-red by sending an array of objects containing the words and boost values to the nodes configured
input property:
```
[{"word":"car","boost":10},{"word":"dog","boost":15},{"word":"bird","boost":5}]
```
To clear the hotwords from the node send an empty array to it.

## Deepspeech-Stream Node
### Usage

For the stream node the same prerequisites as for the wav node apply. It also shares the same settings and advanced settings as described above.
It differs in the following points:

+ this node accepts a stream of raw pcm audio buffers as its input. It will do the inference as the audio arrives. As soon as the audio stream stops it will send the transcription result in the configured `msg` property.
+ the stream needs to have the following format for most available models:
    + 16bit
    + little endian
    + signed-integer
    + 16000hz
    + mono
+ there is a timeout in milliseconds to consider the audio stream as stopped if no new buffers arrive that can be configured in the nodes settings. Setting the timeout to **0** will result in no stopping even if the audio stream stops.
+ in addition the stream inference node supports the following control messages send in the configured input property:
    + a string of **stop** in the configured message property will stop the running inference without returning a result
    + a string of **stop_result** in the configured message property will stop the running inference and return the final inference result
    + a string of **intermediate** in the configured message property will return an intermediate result with the transcription up to that point
