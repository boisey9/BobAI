import Foundation

@MainActor
final class ConversationViewModel: ObservableObject {
    @Published private(set) var messages: [ConversationMessage] = [
        ConversationMessage(
            role: .assistant,
            text: "BobAI is online. Tap the microphone and talk, or type a message below."
        )
    ]
    @Published var draft = ""
    @Published private(set) var isThinking = false
    @Published var errorMessage: String?

    let speech = SpeechRecognizer()

    private let bobService: BobServiceProtocol
    private let speechSynthesizer = SpeechSynthesizer()

    init(bobService: BobServiceProtocol = MockBobService()) {
        self.bobService = bobService
    }

    func prepare() async {
        await speech.requestPermissions()
    }

    func toggleListening() async {
        if speech.isListening {
            let captured = speech.stopListening()
            if !captured.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draft = captured
            }
            return
        }

        if speech.permissionState != .authorized {
            await speech.requestPermissions()
        }

        guard speech.permissionState == .authorized else { return }

        do {
            try speech.startListening()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendDraft() async {
        let input = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty, !isThinking else { return }

        if speech.isListening {
            _ = speech.stopListening()
        }

        draft = ""
        errorMessage = nil
        messages.append(ConversationMessage(role: .user, text: input))
        isThinking = true

        do {
            let reply = try await bobService.reply(to: input)
            messages.append(ConversationMessage(role: .assistant, text: reply))
            speechSynthesizer.speak(reply)
            speech.clearTranscript()
        } catch {
            errorMessage = error.localizedDescription
        }

        isThinking = false
    }
}
