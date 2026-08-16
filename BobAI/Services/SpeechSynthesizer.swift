import AVFoundation
import Foundation

@MainActor
final class SpeechSynthesizer: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var activeUtterance: AVSpeechUtterance?

    var onSpeakingChanged: ((Bool) -> Void)?
    var onSpeakingFinished: (() -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String) {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        activeUtterance = utterance
        synthesizer.speak(utterance)
    }

    func stop() {
        guard synthesizer.isSpeaking else { return }
        synthesizer.stopSpeaking(at: .immediate)
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
        }
    }
}
