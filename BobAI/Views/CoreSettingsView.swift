import SwiftUI

struct CoreSettingsView: View {
    private enum TestResult {
        case success(String)
        case failure(String)

        var message: String {
            switch self {
            case .success(let message), .failure(let message):
                return message
            }
        }

        var color: Color {
            switch self {
            case .success:
                return .green
            case .failure:
                return .red
            }
        }

        var systemImage: String {
            switch self {
            case .success:
                return "checkmark.circle.fill"
            case .failure:
                return "exclamationmark.triangle.fill"
            }
        }
    }

    @ObservedObject var configuration: BobCoreConfiguration

    @Environment(\.dismiss) private var dismiss
    @State private var serverURL: String
    @State private var workspace: String
    @State private var deviceToken = ""
    @State private var isTesting = false
    @State private var testResult: TestResult?

    init(configuration: BobCoreConfiguration) {
        self.configuration = configuration
        _serverURL = State(initialValue: configuration.baseURLString)
        _workspace = State(initialValue: configuration.projectKey)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        "https://your-bob-core.vercel.app",
                        text: $serverURL
                    )
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()

                    SecureField(
                        configuration.hasDeviceToken
                            ? "Stored securely — leave blank to keep"
                            : "Device token",
                        text: $deviceToken
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                } header: {
                    Text("Connection")
                } footer: {
                    Text(
                        "The AI provider and database credentials stay on Bob Core. This phone stores only the device token in the iOS Keychain."
                    )
                }

                Section {
                    TextField("personal", text: $workspace)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Conversation workspace")
                } footer: {
                    Text("Use personal for your own inbox, or a registered project key such as bobai. Switching clears this phone's conversation. Core verifies access.")
                }

                Section {
                    Button {
                        Task {
                            await saveAndTest()
                        }
                    } label: {
                        HStack {
                            if isTesting {
                                ProgressView()
                            }
                            Text(
                                isTesting
                                    ? "Testing server and live reply…"
                                    : "Save & Test Live Reply"
                            )
                        }
                    }
                    .disabled(
                        isTesting
                            || serverURL.trimmingCharacters(
                                in: .whitespacesAndNewlines
                            ).isEmpty
                    )

                    if let testResult {
                        Label(
                            testResult.message,
                            systemImage: testResult.systemImage
                        )
                        .foregroundStyle(testResult.color)
                    }
                } footer: {
                    Text(
                        "This checks authentication, provider access, and one real AI reply instead of testing server health alone."
                    )
                }

                if configuration.isConfigured {
                    Section {
                        Button(
                            "Remove Bob Core Configuration",
                            role: .destructive
                        ) {
                            do {
                                try configuration.clear()
                                serverURL = ""
                                deviceToken = ""
                                testResult = nil
                            } catch {
                                testResult = .failure(
                                    error.localizedDescription
                                )
                            }
                        }
                    }
                }
            }
            .navigationTitle("Bob Core")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func saveAndTest() async {
        isTesting = true
        testResult = nil

        defer {
            isTesting = false
        }

        do {
            try configuration.save(
                baseURL: serverURL,
                deviceToken: deviceToken,
                projectKey: workspace
            )
            deviceToken = ""

            let client = BobCoreClient(configuration: configuration)
            let status = try await client.status()
            let liveReply = try await client.probe()

            let provider = status.provider?.uppercased() ?? "AI"
            let memorySummary: String

            if let memory = status.memory {
                memorySummary = memory.enabled
                    ? " Memory is on."
                    : " Memory is off."
            } else {
                memorySummary = ""
            }

            let replySummary = liveReply
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .prefix(80)

            testResult = .success(
                "Connected to Bob Core \(status.version) using \(provider) / \(status.model).\(memorySummary) Live reply: \(replySummary)"
            )
        } catch {
            testResult = .failure(error.localizedDescription)
        }
    }
}
