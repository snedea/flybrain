import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()
    }
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptEnabled = true
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let script = WKUserScript(
            source: "document.documentElement.style.webkitTouchCallout='none';document.documentElement.style.webkitUserSelect='none';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(script)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .black

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html") else {
            fatalError("index.html not found in bundle")
        }
        let webDir = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
