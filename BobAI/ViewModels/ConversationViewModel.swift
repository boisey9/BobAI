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
    private var voiceAutoSendTask: Task<Void, Never>?
    private let voiceSilenceDelayNanoseconds: UInt64 = 1_600_000_000

    init(configuration: BobCoreConfiguration) {
        self.bobService = BobServiceRouter(configuration: configuration)

        speech.onTranscriptChanged = { [weak self] transcript in
            self?.scheduleVoiceAutoSend(for: transcript)
        }

        speechSynthesizer.onSpeakingChanged = { [weak self] isSpeaking in
            self?.isSpeaking = isSpeaking
            if isSpeaking {
                self?.resetCompletion()
            }
        }

        speechSynthesizer.onSpeakingFinished = { [weak self] in
            self?.showCompletionBriefly()
        }

        speechSynthesizer.onPlaybackError = { [weak self] message in
            self?.errorMessage = message
        }
    }

    func toggleListening() async {
        guard !isThinking else { return }
        resetCompletion()

        if speech.isListening {
            cancelVoiceAutoSend()
            let captured = speech.stopListening()
            await send(input: captured)
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

        cancelVoiceAutoSend()
        speech.clearTranscript()
        errorMessage = nil

        do {
            try speech.startListening()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendDraft() async {
        await send(input: draft)
    }

    private func send(input rawInput: String) async {
        let input = rawInput.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !input.isEmpty, !isThinking else { return }

        cancelVoiceAutoSend()
        resetCompletion()

        if speech.isListening {
            _ = speech.stopListening()
        }

        if isSpeaking {
            speechSynthesizer.stop()
        }

        draft = ""
        speech.clearTranscript()
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func scheduleVoiceAutoSend(for transcript: String) {
        cancelVoiceAutoSend()

        let candidate = transcript.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !candidate.isEmpty, speech.isListening else { return }

        voiceAutoSendTask = Task { [weak self] in
            do {
                try await Task.sleep(
                    nanoseconds: self?.voiceSilenceDelayNanoseconds
                        ?? 1_600_000_000
                )
            } catch {
                return
            }

            guard let self,
                  !Task.isCancelled,
                  self.speech.isListening else {
                return
            }

            let latest = self.speech.transcript.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            guard latest == candidate else { return }

            self.voiceAutoSendTask = nil
            let captured = self.speech.stopListening()
            await self.send(input: captured)
        }
    }

    private func cancelVoiceAutoSend() {
        voiceAutoSendTask?.cancel()
        voiceAutoSendTask = nil
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
