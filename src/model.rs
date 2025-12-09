use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub method: String, // GET, POST, PUT, DELETE, etc.
}

impl Default for Endpoint {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "New Endpoint".to_string(),
            url: "https://httpbin.org/get".to_string(),
            method: "GET".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    pub id: Uuid,
    pub name: String, // e.g. "JSON Content"
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

impl Default for Header {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "New Header".to_string(),
            key: "".to_string(),
            value: "".to_string(),
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Body {
    pub id: Uuid,
    pub name: String,
    pub content_type: String, // "application/json", "text/plain"
    pub content: String,
}

impl Default for Body {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "New Body".to_string(),
            content_type: "application/json".to_string(),
            content: "{}".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub timestamp: DateTime<Utc>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub endpoints: Vec<Endpoint>,
    pub headers: Vec<Header>,
    pub bodies: Vec<Body>,
    pub spaces: Vec<Space>,
}

impl Default for Workspace {
    fn default() -> Self {
        let ep1 = Endpoint {
            name: "Get HttpBin".to_string(),
            url: "https://httpbin.org/get".to_string(),
            method: "GET".to_string(),
            ..Endpoint::default()
        };
        let h1 = Header {
            name: "JSON Content".to_string(),
            key: "Content-Type".to_string(),
            value: "application/json".to_string(),
            ..Header::default()
        };
        let b1 = Body {
            name: "Empty JSON".to_string(),
            content: "{}".to_string(),
            ..Body::default()
        };
        let s1 = Space {
            name: "Test Space".to_string(),
            ..Space::default()
        };

        Self {
            endpoints: vec![ep1],
            headers: vec![h1],
            bodies: vec![b1],
            spaces: vec![s1],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Space {
    pub id: Uuid,
    pub name: String,
    pub selected_endpoint_id: Option<Uuid>,
    pub selected_header_ids: Vec<Uuid>,
    pub selected_body_id: Option<Uuid>,
    pub history: Vec<ResponseData>,
}

impl Default for Space {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "New Space".to_string(),
            selected_endpoint_id: None,
            selected_header_ids: Vec::new(),
            selected_body_id: None,
            history: Vec::new(),
        }
    }
}

