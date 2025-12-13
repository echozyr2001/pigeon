#[deprecated]
#[allow(dead_code)]
mod model;

use serde::{Deserialize, Serialize};
use std::ffi::{c_char, CStr, CString};
use std::panic::AssertUnwindSafe;
use std::sync::OnceLock;

static TOKIO_RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn get_tokio_runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FfiRequest {
    method: String,
    url: String,
    #[serde(default)]
    headers: Vec<FfiHeader>,
    body: Option<FfiBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FfiHeader {
    key: String,
    value: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FfiBody {
    #[serde(default)]
    content_type: String,
    #[serde(default)]
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfiResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    duration_ms: u64,
}

fn json_error(message: impl Into<String>) -> String {
    serde_json::to_string(&FfiResponse {
        status: 0,
        status_text: "Error".to_string(),
        headers: vec![],
        body: message.into(),
        duration_ms: 0,
    })
    .unwrap_or_else(|_| "{\"status\":0,\"statusText\":\"Error\",\"headers\":[],\"body\":\"serialization error\",\"durationMs\":0}".to_string())
}

fn string_to_c_char_ptr(s: String) -> *mut c_char {
    // If there is an interior NUL (shouldn't happen for JSON), degrade gracefully.
    match CString::new(s) {
        Ok(cstr) => cstr.into_raw(),
        Err(_) => CString::new(json_error("Invalid string (interior NUL)"))
            .unwrap()
            .into_raw(),
    }
}

/// Send an HTTP request described by a JSON string and return response JSON.
///
/// # Safety
/// - `req_json` must be either NULL or point to a valid NUL-terminated C string.
/// - Returned pointer must be freed by calling `pigeon_free_string`.
#[no_mangle]
pub unsafe extern "C" fn pigeon_send_request(req_json: *const c_char) -> *mut c_char {
    let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
        if req_json.is_null() {
            return string_to_c_char_ptr(json_error("req_json is null"));
        }

        let req_str = unsafe { CStr::from_ptr(req_json) };
        let req_str = match req_str.to_str() {
            Ok(s) => s,
            Err(e) => return string_to_c_char_ptr(json_error(format!("invalid utf-8: {e}"))),
        };

        let parsed: FfiRequest = match serde_json::from_str(req_str) {
            Ok(v) => v,
            Err(e) => return string_to_c_char_ptr(json_error(format!("invalid json: {e}"))),
        };

        let rt = get_tokio_runtime();
        let response_json: String = rt.block_on(async move {
            let method = parsed
                .method
                .parse::<reqwest::Method>()
                .unwrap_or(reqwest::Method::GET);

            let client = reqwest::Client::new();
            let mut req = client.request(method, &parsed.url);

            for h in parsed.headers {
                if h.enabled {
                    req = req.header(&h.key, &h.value);
                }
            }

            if let Some(body) = parsed.body {
                if !body.content_type.trim().is_empty() {
                    req = req.header("Content-Type", body.content_type);
                }
                if !body.content.is_empty() {
                    req = req.body(body.content);
                }
            }

            let start = std::time::Instant::now();
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let status_text = resp.status().to_string();
                    let headers = resp
                        .headers()
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                        .collect::<Vec<_>>();
                    let body = resp.text().await.unwrap_or_default();
                    let duration_ms = start.elapsed().as_millis() as u64;

                    serde_json::to_string(&FfiResponse {
                        status,
                        status_text,
                        headers,
                        body,
                        duration_ms,
                    })
                    .unwrap_or_else(|e| json_error(format!("serialize response failed: {e}")))
                }
                Err(e) => json_error(format!("request failed: {e}")),
            }
        });

        string_to_c_char_ptr(response_json)
    }));

    match result {
        Ok(ptr) => ptr,
        Err(_) => string_to_c_char_ptr(json_error("panic in pigeon_send_request")),
    }
}

/// Free a string returned by `pigeon_send_request`.
///
/// # Safety
/// - `ptr` must be either NULL or a pointer previously returned by `pigeon_send_request`.
/// - Must not be called twice for the same pointer.
#[no_mangle]
pub unsafe extern "C" fn pigeon_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}
