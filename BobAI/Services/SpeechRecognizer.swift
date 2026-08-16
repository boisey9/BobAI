import AVFoundation
import Foundation
import Speech

@MainActor
final class SpeechRecognizer: NSObject, ObservableObject {
    enum PermissionState: Equatable {
        case unknown
        case authorized
        case denied
    }

    enum SpeechError: LocalizedError {
        case unavailable

        var errorDescription: String? {
            "Speech recognition is currently unavailable."
        }
    }

    @Published private(set) var transcript = ""
    @Published private(set) var isListening = false
    @Published private(set) var permissionState: PermissionState = .unknown
    @Published var errorMessage: String?

    var onTranscriptChanged: ((String) -> Void)?

    private let audioEngine = AVAudioEngine()
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func requestPermissions() async {
        let speechStatus: SFSpeechRecognizerAuthorizationStatus =
            await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status)
                }
            }

        let microphoneGranted: Bool = await withCheckedContinuation {
            continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }

        permissionState =
            (speechStatus == .authorized && microphoneGranted)
                ? .authorized
                : .denied

        if permissionState == .denied {
            errorMessage =
                "Microphone and Speech Recognition access are required for voice input. You can still type to Bob."
        }
    }

    func startListening() throws {
        guard permissionState == .authorized else {
            errorMessage =
                "Voice permission has not been granted. You can still type to Bob."
            return
        }

        guard !isListening else { return }
        guard let speechRecognizer, speechRecognizer.isAvailable else {
            throw SpeechError.unavailable
        }

        transcript = ""
        errorMessage = nil
        recognitionTask?.cancel()
        recognitionTask = nil

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(
            .record,
            mode: .measurement,
            options: .duckOthers
        )
        try audioSession.setActive(true)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(
            onBus: 0,
            bufferSize: 1_024,
            format: recordingFormat
        ) { buffer, _ in
            request.append(buffer)
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
        } catch {
            inputNode.removeTap(onBus: 0)
            recognitionRequest = nil
            try? audioSession.setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
            throw error
        }

        recognitionTask = speechRecognizer.recognitionTask(
            with: request
        ) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }

                if let result {
                    let latestTranscript =
                        result.bestTranscription.formattedString

                    if latestTranscript != self.transcript {
                        self.transcript = latestTranscript
                        self.onTranscriptChanged?(latestTranscript)
                    }
                }

                if error != nil, self.isListening {
                    self.errorMessage =
                        "Speech recognition stopped unexpectedly. Tap the Core to try again."
                    _ = self.stopListening()
                }
            }
        }
    }

    @discardableResult
    func stopListening() -> String {
        let capturedTranscript = transcript
        let wasListening = isListening
        isListening = false

        if audioEngine.isRunning {
            audioEngine.stop()
        }

        if wasListening {
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil

        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
        return capturedTranscript
    }

    func clearTranscript() {
        transcript = ""
    }
}
