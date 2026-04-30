import logging
from google.cloud import texttospeech

logger = logging.getLogger(__name__)

def synthesize_speech(text: str, output_path: str) -> bool:
    """
    Synthesizes speech from text using Google Cloud TTS and saves it to output_path.
    """
    try:
        client = texttospeech.TextToSpeechClient()

        synthesis_input = texttospeech.SynthesisInput(text=text)

        # Standard YouTube Shorts voice: Journey-F or standard US English
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Journey-F"
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        with open(output_path, "wb") as out:
            out.write(response.audio_content)
            logger.info(f"Audio content written to file: {output_path}")
            
        return True
    except Exception as e:
        logger.error(f"Text-to-Speech synthesis failed: {e}")
        return False
