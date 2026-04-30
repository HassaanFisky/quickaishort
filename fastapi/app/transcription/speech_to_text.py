import logging
from google.cloud import speech

logger = logging.getLogger(__name__)

def transcribe_audio_from_gcs(gcs_uri: str) -> str:
    """
    Transcribes audio from a GCS URI using Google Cloud Speech-to-Text.
    """
    try:
        client = speech.SpeechClient()

        audio = speech.RecognitionAudio(uri=gcs_uri)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.MP3,
            sample_rate_hertz=16000,
            language_code="en-US",
            enable_automatic_punctuation=True,
        )

        logger.info(f"Starting transcription for {gcs_uri}")
        operation = client.long_running_recognize(config=config, audio=audio)
        
        response = operation.result(timeout=300)
        
        transcript = []
        for result in response.results:
            transcript.append(result.alternatives[0].transcript)
            
        return " ".join(transcript)
    except Exception as e:
        logger.error(f"Speech-to-Text failed for {gcs_uri}: {e}")
        return ""
