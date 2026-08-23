import Foundation

@MainActor
final class BobCoreClient {
    struct CoreStatus: Decodable {
        struct MemoryStatus: Decodable {
            let enabled: Bool
            let storage: String
            let capture: String
            let retrieval: String
        }

        struct SharedContextStatus: Decodable {
            let enabled: Bool
            let version: String
            let storage: String
        }

        let status: String
        let version: String
        let provider: String?
        let model: String
        let memory: MemoryStatus?
        let sharedContext: SharedContextStatus?
    }

    struct ActivityItem: Decodable, Identifiable {
        let id: String
        let projectKey: String?
        let projectName: String?
        let eventType: String
        let summary: String
        let source: String
        let createdAt: String
    }

    enum ClientError: LocalizedError {
        case invalidResponse
        case unauthorized
        case server(
            statusCode: Int,
            code: String?,
            message: String,
            requestId: String?
        )
        case emptyResponse

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "Bob Core returned an invalid response."
            case .unauthorized:
                return "Bob Core rejected this device token."
            case .server(
                let statusCode,
                let code,
                let message,
                let requestId
            ):
                var details: [String] = [message]

                if let code, !code.isEmpty {
                    details.append("Code: \(code)")
                } else {
                    details.append("HTTP: \(statusCode)")
                }

                if let requestId, !requestId.isEmpty {
                    details.append("Request: \(requestId)")
                }

                return details.joined(separator: "\n")
            case .emptyResponse:
                return "Bob Core returned an empty response."
            }
        }
    }

    private struct APIMessage: Codable {
        let role: String
        let content: String
    }

    private struct ChatRequest: Encodable {
        let conversationId: String
        let messages: [APIMessage]
    }

    private struct ChatResponse: Decodable {
        struct Message: Decodable {
            let role: String
            let content: String
        }

        let conversationId: String
        let message: Message
        let model: String
        let requestId: String
    }

    private struct ActivityResponse: Decodable {
        let activity: [ActivityItem]
        let requestId: String
    }

    private struct APIErrorResponse: Decodable {
        struct APIError: Decodable {
            let code: String
            let message: String
            let requestId: String?
        }

        let error: APIError
    }

    private let configuration: BobCoreConfiguration
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        configuration: BobCoreConfiguration,
        session: URLSession? = nil
    ) {
        self.configuration = configuration

        if let session {
            self.session = session
        } else {
            let sessionConfiguration = URLSessionConfiguration.ephemeral
            sessionConfiguration.waitsForConnectivity = true
            sessionConfiguration.timeoutIntervalForRequest = 45
            sessionConfiguration.timeoutIntervalForResource = 60
            self.session = URLSession(
                configuration: sessionConfiguration
            )
        }
    }

    func status() async throws -> CoreStatus {
        let credentials = try configuration.credentials()
        var request = URLRequest(
            url: endpoint("v1/status", baseURL: credentials.baseURL)
        )
        request.httpMethod = "GET"
        addHeaders(to: &request, token: credentials.deviceToken)

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)

        return try decoder.decode(CoreStatus.self, from: data)
    }

    func activity(
        projectKey: String? = nil,
        limit: Int = 50
    ) async throws -> [ActivityItem] {
        let credentials = try configuration.credentials()
        let baseEndpoint = endpoint(
            "v1/activity",
            baseURL: credentials.baseURL
        )
        var components = URLComponents(
            url: baseEndpoint,
            resolvingAgainstBaseURL: false
        )
        var queryItems = [
            URLQueryItem(
                name: "limit",
                value: String(max(1, min(limit, 100)))
            )
        ]

        if let projectKey,
           !projectKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryItems.append(
                URLQueryItem(
                    name: "project",
                    value: projectKey
                )
            )
        }

        components?.queryItems = queryItems
        guard let url = components?.url else {
            throw ClientError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        addHeaders(to: &request, token: credentials.deviceToken)

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)

        return try decoder.decode(ActivityResponse.self, from: data).activity
    }

    func probe() async throws -> String {
        try await reply(
            messages: [
                ConversationMessage(
                    role: .user,
                    text: "Connection check. Reply with a very short confirmation that Bob Core is ready."
                )
            ],
            conversationId: UUID().uuidString
        )
    }

    func reply(
        messages: [ConversationMessage],
        conversationId: String
    ) async throws -> String {
        let credentials = try configuration.credentials()
        var request = URLRequest(
            url: endpoint("v1/chat", baseURL: credentials.baseURL)
        )
        request.httpMethod = "POST"
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )
        addHeaders(to: &request, token: credentials.deviceToken)

        let recentMessages = messages.suffix(20).map {
            APIMessage(role: $0.role.rawValue, content: $0.text)
        }

        request.httpBody = try encoder.encode(
            ChatRequest(
                conversationId: conversationId,
                messages: recentMessages
            )
        )

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)

        let decoded = try decoder.decode(ChatResponse.self, from: data)
        let text = decoded.message.content.trimmingCharacters(
            in: .whitespacesAndNewlines
        )

        guard !text.isEmpty else {
            throw ClientError.emptyResponse
        }

        return text
    }

    private func endpoint(
        _ path: String,
        baseURL: URL
    ) -> URL {
        path.split(separator: "/").reduce(baseURL) { url, component in
            url.appendingPathComponent(String(component))
        }
    }

    private func addHeaders(
        to request: inout URLRequest,
        token: String
    ) {
        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField: "Authorization"
        )
        request.setValue(
            "BobAI-iOS/0.2",
            forHTTPHeaderField: "User-Agent"
        )
    }

    private func validate(
        response: URLResponse,
        data: Data
    ) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 {
                throw ClientError.unauthorized
            }

            let decodedError = try? decoder.decode(
                APIErrorResponse.self,
                from: data
            )
            let apiError = decodedError?.error
            let message = apiError?.message
                ?? "Bob Core returned HTTP \(httpResponse.statusCode)."

            throw ClientError.server(
                statusCode: httpResponse.statusCode,
                code: apiError?.code,
                message: message,
                requestId: apiError?.requestId
            )
        }
    }
}
