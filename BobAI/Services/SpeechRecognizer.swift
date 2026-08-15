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

    private let audioEngine = AVAudioEngine()
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func requestPermissions() async {
        let speechStatus: SFSpeechRecognizerAuthorizationStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        let microphoneGranted: Bool = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }

        permissionState = (speechStatus == .authorized && microphoneGranted) ? .authorized : .denied

        if permissionState == .denied {
            errorMessage = "Microphone and Speech Recognition access are required for voice input. You can still type to Bob."
        }
    }

    func startListening() throws {
        guard permissionState == .authorized else {
            errorMessage = "Voice permission has not been granted. You can still type to Bob."
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
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
        } catch {
            inputNode.removeTap(onBus: 0)
            recognitionRequest = nil
            try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            throw error
        }

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }

                if let result {
                    self.transcript = result.bestTranscription.formattedString
                }

                if error != nil {
                    _ = self.stopListening()
                }
            }
        }
    }

    @discardableResult
    func stopListening() -> String {
        if audioEngine.isRunning {
            audioEngine.stop()
        }

        if isListening {
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return transcript
    }

    func clearTranscript() {
        transcript = ""
    }
}
