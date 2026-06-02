# ZIP Robot Voice State Message
# Current state of the voice loop (STT → Orchestration → TTS)

std_msgs/Header header

uint8 STATE_IDLE = 0
uint8 STATE_LISTENING = 1
uint8 STATE_PROCESSING = 2
uint8 STATE_SPEAKING = 3
uint8 STATE_ERROR = 4

uint8 current_state

# Current transcription (if listening/processing)
string current_transcription

# Current TTS text (if speaking)
string current_tts_text

# Barge-in detection
bool barge_in_detected

# Timestamps
builtin_interfaces/Time state_entered_time
builtin_interfaces/Time last_audio_time
