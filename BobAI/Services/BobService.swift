import Foundation

@MainActor
protocol BobServiceProtocol {
    func reply(to messages: [ConversationMessage]) async throws -> String
}

@MainActor
final class BobServiceRouter: BobServiceProtocol {
    private let configuration: BobCoreConfiguration
    private let client: BobCoreClient
    private let mock = MockBobService()
    private let conversationId = UUID().uuidString

    init(configuration: BobCoreConfiguration) {
        self.configuration = configuration
        self.client = BobCoreClient(configuration: configuration)
    }

    func reply(to messages: [ConversationMessage]) async throws -> String {
        if configuration.isConfigured {
            return try await client.reply(
                messages: messages,
                conversationId: conversationId
            )
        }

        return try await mock.reply(to: messages)
    }
}

struct MockBobService: BobServiceProtocol {
    func reply(to messages: [ConversationMessage]) async throws -> String {
        try await Task.sleep(nanoseconds: 450_000_000)

        let input = messages.last(where: { $0.role == .user })?.text ?? ""
        let normalized = input.lowercased()

        if normalized.contains("hello")
            || normalized.contains("hi bob")
            || normalized == "hi"
        {
            return "Hey! BobAI is in demo mode. Connect Bob Core in Settings for real AI responses."
        }

        if normalized.contains("who are you") {
            return "I'm BobAI. The phone interface is working, but Bob Core is not connected yet."
        }

        return "I heard: \"\(input)\". Open Bob Core Settings to connect the real AI backend."
    }
}
