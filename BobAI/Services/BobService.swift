import Foundation

protocol BobServiceProtocol {
    func reply(to input: String) async throws -> String
}

struct MockBobService: BobServiceProtocol {
    func reply(to input: String) async throws -> String {
        try await Task.sleep(nanoseconds: 450_000_000)

        let normalized = input.lowercased()

        if normalized.contains("hello") || normalized.contains("hi bob") || normalized == "hi" {
            return "Hey! BobAI is online. Voice capture and the conversation shell are working."
        }

        if normalized.contains("who are you") {
            return "I'm BobAI. This first build is the device interface. Next we'll connect me to Bob Core for real reasoning, memory, and tools."
        }

        return "I heard: \"\(input)\". The app is working, but I'm still using the local test service. Bob Core is the next connection."
    }
}
