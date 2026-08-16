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
    @State private var deviceToken = ""
    @State private var isTesting = false
    @State private var testResult: TestResult?

    init(configuration: BobCoreConfiguration) {
        self.configuration = configuration
        _serverURL = State(initialValue: configuration.baseURLString)
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
                        "The OpenAI key stays on Bob Core. This phone stores only the device token in the iOS Keychain."
                    )
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
                                    ? "Testing Bob Core…"
                                    : "Save & Test Connection"
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
                                testResult = .failure(error.localizedDescription)
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
                deviceToken: deviceToken
            )
            deviceToken = ""

            let status = try await BobCoreClient(
                configuration: configuration
            ).status()

            testResult = .success(
                "Connected to Bob Core \(status.version) using \(status.model)."
            )
        } catch {
            testResult = .failure(error.localizedDescription)
        }
    }
}
