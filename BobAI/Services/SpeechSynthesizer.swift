import AVFoundation
import Foundation

@MainActor
final class SpeechSynthesizer: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private let audioSession = AVAudioSession.sharedInstance()
    private var activeUtterance: AVSpeechUtterance?

    var onSpeakingChanged: ((Bool) -> Void)?
    var onSpeakingFinished: (() -> Void)?
    var onPlaybackError: ((String) -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
        synthesizer.usesApplicationAudioSession = true
    }

    func speak(_ text: String) {
        let spokenText = text.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !spokenText.isEmpty else { return }

        if synthesizer.isSpeaking || activeUtterance != nil {
            _ = synthesizer.stopSpeaking(at: .immediate)
        }

        do {
            try audioSession.setCategory(
                .playback,
                mode: .voicePrompt,
                options: [
                    .duckOthers,
                    .interruptSpokenAudioAndMixWithOthers
                ]
            )
            try audioSession.setActive(true)
        } catch {
            activeUtterance = nil
            onSpeakingChanged?(false)
            onPlaybackError?(
                "Bob could not start audio playback. Check the iPhone media volume and current audio output, then try again."
            )
            return
        }

        let utterance = AVSpeechUtterance(string: spokenText)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.volume = 1

        if let preferredLanguage = Locale.preferredLanguages.first,
           let voice = AVSpeechSynthesisVoice(
               language: preferredLanguage
           ) {
            utterance.voice = voice
        }

        activeUtterance = utterance
        synthesizer.speak(utterance)
    }

    func stop() {
        guard synthesizer.isSpeaking || activeUtterance != nil else {
            return
        }

        let didStop = synthesizer.stopSpeaking(at: .immediate)
        if !didStop {
            activeUtterance = nil
            onSpeakingChanged?(false)
            deactivatePlaybackSession()
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didStart utterance: AVSpeechUtterance
    ) {
        Task { @MainActor [weak self] in
            guard let self, self.activeUtterance === utterance else {
                return
            }
            self.onSpeakingChanged?(true)
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        Task { @MainActor [weak self] in
            guard let self, self.activeUtterance === utterance else {
                return
            }

            self.activeUtterance = nil
            self.onSpeakingChanged?(false)
            self.deactivatePlaybackSession()
            self.onSpeakingFinished?()
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        Task { @MainActor [weak self] in
            guard let self, self.activeUtterance === utterance else {
                return
            }

            self.activeUtterance = nil
            self.onSpeakingChanged?(false)
            self.deactivatePlaybackSession()
        }
    }

    private func deactivatePlaybackSession() {
        try? audioSession.setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }
}
