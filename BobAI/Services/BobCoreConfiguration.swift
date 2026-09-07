import Foundation

struct BobCoreCredentials {
    let baseURL: URL
    let deviceToken: String
    let projectKey: String
}

@MainActor
final class BobCoreConfiguration: ObservableObject {
    enum ConfigurationError: LocalizedError {
        case invalidURL
        case insecureURL
        case missingDeviceToken
        case invalidWorkspace
        case tokenTooShort

        var errorDescription: String? {
            switch self {
            case .invalidWorkspace:
                return "Enter Personal or a registered project key such as bobai."
            case .invalidURL:
                return "Enter a valid Bob Core server URL."
            case .insecureURL:
                return "Bob Core must use an HTTPS address."
            case .missingDeviceToken:
                return "Enter the Bob Core device token."
            case .tokenTooShort:
                return "The Bob Core device token must be at least 32 characters."
            }
        }
    }

    @Published private(set) var projectKey: String
    @Published private(set) var baseURLString: String
    @Published private(set) var hasDeviceToken: Bool

    private let defaults: UserDefaults
    private let baseURLKey = "bobCore.baseURL"
    private let keychainService = "com.boisey9.BobAI"
    private let keychainAccount = "bob-core-device-token"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.projectKey = defaults.string(forKey: "bobCore.projectKey") ?? "personal"
        self.baseURLString = defaults.string(forKey: baseURLKey) ?? ""
        self.hasDeviceToken =
            (try? KeychainStore.read(
                service: keychainService,
                account: keychainAccount
            )) != nil
    }

    var isConfigured: Bool {
        !baseURLString.isEmpty && hasDeviceToken
    }

    func credentials() throws -> BobCoreCredentials {
        let normalizedURL = try normalizedBaseURL(from: baseURLString)

        guard let token = try KeychainStore.read(
            service: keychainService,
            account: keychainAccount
        ) else {
            throw ConfigurationError.missingDeviceToken
        }

        return BobCoreCredentials(
            baseURL: normalizedURL,
            deviceToken: token,
            projectKey: projectKey
        )
    }

    func save(
        baseURL: String,
        deviceToken: String,
        projectKey: String = "personal"
    ) throws {
        let workspace = projectKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard workspace.range(of: "^[a-z0-9][a-z0-9_-]{0,99}$", options: .regularExpression) != nil else {
            throw ConfigurationError.invalidWorkspace
        }
        let normalizedURL = try normalizedBaseURL(from: baseURL)
        let trimmedToken = deviceToken.trimmingCharacters(
            in: .whitespacesAndNewlines
        )

        if !trimmedToken.isEmpty {
            guard trimmedToken.count >= 32 else {
                throw ConfigurationError.tokenTooShort
            }

            try KeychainStore.save(
                trimmedToken,
                service: keychainService,
                account: keychainAccount
            )
        } else if !hasDeviceToken {
            throw ConfigurationError.missingDeviceToken
        }

        let normalizedString = normalizedURL.absoluteString
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        defaults.set(normalizedString, forKey: baseURLKey)
        baseURLString = normalizedString
        hasDeviceToken = true
        defaults.set(workspace, forKey: "bobCore.projectKey")
        self.projectKey = workspace
    }

    func clear() throws {
        try KeychainStore.delete(
            service: keychainService,
            account: keychainAccount
        )
        defaults.removeObject(forKey: baseURLKey)
        baseURLString = ""
        hasDeviceToken = false
        defaults.removeObject(forKey: "bobCore.projectKey")
        projectKey = "personal"
    }

    private func normalizedBaseURL(from value: String) throws -> URL {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

        guard
            var components = URLComponents(string: trimmed),
            let host = components.host,
            !host.isEmpty,
            components.user == nil,
            components.password == nil
        else {
            throw ConfigurationError.invalidURL
        }

        guard components.scheme?.lowercased() == "https" else {
            throw ConfigurationError.insecureURL
        }

        components.query = nil
        components.fragment = nil

        guard let url = components.url else {
            throw ConfigurationError.invalidURL
        }

        return url
    }
}
