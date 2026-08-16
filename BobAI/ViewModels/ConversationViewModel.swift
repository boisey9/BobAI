import Foundation

@MainActor
final class ConversationViewModel: ObservableObject {
    @Published private(set) var messages: [ConversationMessage] = [
        ConversationMessage(
            role: .assistant,
            text: "BobAI is online. Tap the glowing Core and talk, or type a message below."
        )
    ]
    @Published var draft = ""
    @Published private(set) var isThinking = false
    @Published private(set) var isSpeaking = false
    @Published private(set) var isComplete = false
    @Published var errorMessage: String?

    let speech = SpeechRecognizer()

    private let bobService: BobServiceProtocol
    private let speechSynthesizer = SpeechSynthesizer()
    private var completionTask: Task<Void, Never>?

    init(configuration: BobCoreConfiguration) {
        self.bobService = BobServiceRouter(configuration: configuration)

        speechSynthesizer.onSpeakingChanged = { [weak self] isSpeaking in
            self?.isSpeaking = isSpeaking
            if isSpeaking {
                self?.resetCompletion()
            }
        }

        speechSynthesizer.onSpeakingFinished = { [weak self] in
            self?.showCompletionBriefly()
        }
    }

    func toggleListening() async {
        guard !isThinking else { return }
        resetCompletion()

        if speech.isListening {
            let captured = speech.stopListening()
            if !captured.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty {
                draft = captured
            }
            return
        }

        if isSpeaking {
            speechSynthesizer.stop()
        }

        if speech.permissionState != .authorized {
            await speech.requestPermissions()
        }

        guard speech.permissionState == .authorized else {
            errorMessage = speech.errorMessage
            return
        }

        do {
            try speech.startListening()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendDraft() async {
        let input = draft.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !input.isEmpty, !isThinking else { return }

        resetCompletion()

        if speech.isListening {
            _ = speech.stopListening()
        }

        if isSpeaking {
            speechSynthesizer.stop()
        }

        draft = ""
        errorMessage = nil
        messages.append(ConversationMessage(role: .user, text: input))
        isThinking = true

        defer {
            isThinking = false
        }

        do {
            let reply = try await bobService.reply(to: messages)
            messages.append(
                ConversationMessage(role: .assistant, text: reply)
            )
            speechSynthesizer.speak(reply)
            speech.clearTranscript()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resetCompletion() {
        completionTask?.cancel()
        completionTask = nil
        isComplete = false
    }

    private func showCompletionBriefly() {
        resetCompletion()
        isComplete = true

        completionTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 900_000_000)
            guard !Task.isCancelled else { return }
            self?.isComplete = false
        }
    }
}
