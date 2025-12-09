use gpui::prelude::*;
use gpui::*;
use std::sync::OnceLock;
use uuid::Uuid;

mod model;
use model::{Header, ResponseData, Space, Workspace};

static TOKIO_RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn get_tokio_runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

struct LightweightPostman {
    workspace: Entity<Workspace>,
    active_space_id: Option<Uuid>,
}

impl LightweightPostman {
    fn new(cx: &mut Context<Self>) -> Self {
        let workspace = cx.new(|_| Workspace::default());
        Self {
            workspace,
            active_space_id: None,
        }
    }

    fn select_space(&mut self, id: Uuid, cx: &mut Context<Self>) {
        self.active_space_id = Some(id);
        cx.notify();
    }

    fn select_endpoint(&mut self, space_id: Uuid, endpoint_id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                space.selected_endpoint_id = Some(endpoint_id);
            }
        });
        cx.notify();
    }

    fn toggle_header(&mut self, space_id: Uuid, header_id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                if let Some(pos) = space
                    .selected_header_ids
                    .iter()
                    .position(|id| *id == header_id)
                {
                    space.selected_header_ids.remove(pos);
                } else {
                    space.selected_header_ids.push(header_id);
                }
            }
        });
        cx.notify();
    }

    fn select_body(&mut self, space_id: Uuid, body_id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                space.selected_body_id = Some(body_id);
            }
        });
        cx.notify();
    }

    fn send_request(&mut self, cx: &mut Context<Self>) {
        let Some(space_id) = self.active_space_id else {
            return;
        };
        let workspace = self.workspace.read(cx).clone();

        let Some(space) = workspace.spaces.iter().find(|s| s.id == space_id).cloned() else {
            return;
        };
        let endpoint = space
            .selected_endpoint_id
            .and_then(|id| workspace.endpoints.iter().find(|e| e.id == id).cloned());
        let headers: Vec<Header> = space
            .selected_header_ids
            .iter()
            .filter_map(|id| workspace.headers.iter().find(|h| h.id == *id).cloned())
            .collect();
        let body = space
            .selected_body_id
            .and_then(|id| workspace.bodies.iter().find(|b| b.id == id).cloned());

        let Some(endpoint) = endpoint else { return };

        let workspace_entity = self.workspace.clone();

        cx.spawn(move |_, cx: &mut AsyncApp| {
            let cx = cx.clone();
            async move {
                let handle = get_tokio_runtime().spawn(async move {
                    let client = reqwest::Client::new();
                    let mut req = client.request(
                        endpoint.method.parse().unwrap_or(reqwest::Method::GET),
                        &endpoint.url,
                    );

                    for header in headers {
                        if header.enabled {
                            req = req.header(&header.key, &header.value);
                        }
                    }

                    if let Some(body) = body {
                        req = req.header("Content-Type", &body.content_type);
                        req = req.body(body.content);
                    }

                    let start = std::time::Instant::now();
                    let result = req.send().await;
                    let duration = start.elapsed().as_millis() as u64;

                    match result {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            let status_text = resp.status().to_string();
                            let headers = resp
                                .headers()
                                .iter()
                                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                                .collect();
                            let body_text = resp.text().await.unwrap_or_default();

                            ResponseData {
                                status,
                                status_text,
                                headers,
                                body: body_text,
                                timestamp: chrono::Utc::now(),
                                duration_ms: duration,
                            }
                        }
                        Err(e) => ResponseData {
                            status: 0,
                            status_text: "Error".to_string(),
                            headers: vec![],
                            body: e.to_string(),
                            timestamp: chrono::Utc::now(),
                            duration_ms: duration,
                        },
                    }
                });

                if let Ok(response_data) = handle.await {
                    cx.update(|cx| {
                        workspace_entity.update(cx, |ws, _| {
                            if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                                space.history.insert(0, response_data);
                                if space.history.len() > 10 {
                                    space.history.pop();
                                }
                            }
                        });
                    })
                    .ok();
                }
            }
        })
        .detach();
    }

    fn render_sidebar(&self, cx: &Context<Self>) -> impl IntoElement {
        let workspace = self.workspace.read(cx);

        div()
            .w_64()
            .h_full()
            .border_r_1()
            .border_color(rgb(0x333333))
            .flex()
            .flex_col()
            .child(div().p_4().font_weight(FontWeight::BOLD).child("Workspace"))
            .child(
                div()
                    .p_2()
                    .child(div().font_weight(FontWeight::BOLD).mb_2().child("Spaces"))
                    .children(workspace.spaces.iter().enumerate().map(|(i, space)| {
                        let is_active = self.active_space_id == Some(space.id);
                        let id = space.id;
                        div()
                            .id(i)
                            .p_1()
                            .rounded_md()
                            .bg(if is_active {
                                rgb(0x333333)
                            } else {
                                rgb(0x1e1e1e)
                            })
                            .hover(|s| s.bg(rgb(0x2a2a2a)))
                            .cursor_pointer()
                            .child(space.name.clone())
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.select_space(id, cx);
                                }),
                            )
                    })),
            )
    }

    fn render_main(&self, cx: &Context<Self>) -> impl IntoElement {
        let workspace = self.workspace.read(cx);

        if let Some(space_id) = self.active_space_id {
            if let Some(space) = workspace.spaces.iter().find(|s| s.id == space_id) {
                return div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .p_4()
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .mb_4()
                            .child(space.name.clone()),
                    )
                    .child(self.render_space_form(space, workspace, cx))
                    .child(self.render_response_area(space, cx));
            }
        }

        div()
            .flex_1()
            .flex()
            .items_center()
            .justify_center()
            .child("Select a Space to start")
    }

    fn render_space_form(
        &self,
        space: &Space,
        workspace: &Workspace,
        cx: &Context<Self>,
    ) -> impl IntoElement {
        let space_id = space.id;

        div()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                // Endpoint Selection
                div().flex().flex_col().gap_2().child("Endpoint").children(
                    workspace.endpoints.iter().enumerate().map(|(i, ep)| {
                        let selected = space.selected_endpoint_id == Some(ep.id);
                        let ep_id = ep.id;
                        div()
                            .id(SharedString::from(format!("ep-{}", i)))
                            .flex()
                            .items_center()
                            .gap_2()
                            .p_1()
                            .rounded_md()
                            .bg(if selected {
                                rgb(0x2a2a2a)
                            } else {
                                rgb(0x1e1e1e)
                            })
                            .cursor_pointer()
                            .child(
                                div()
                                    .w_16()
                                    .font_weight(FontWeight::BOLD)
                                    .child(ep.method.clone()),
                            )
                            .child(ep.name.clone())
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(rgb(0x888888))
                                    .child(ep.url.clone()),
                            )
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.select_endpoint(space_id, ep_id, cx);
                                }),
                            )
                    }),
                ),
            )
            .child(
                // Header Selection
                div().flex().flex_col().gap_2().child("Headers").children(
                    workspace.headers.iter().enumerate().map(|(i, h)| {
                        let selected = space.selected_header_ids.contains(&h.id);
                        let h_id = h.id;
                        div()
                            .id(SharedString::from(format!("h-{}", i)))
                            .flex()
                            .items_center()
                            .gap_2()
                            .cursor_pointer()
                            .child(if selected { "[x]" } else { "[ ]" })
                            .child(format!("{}: {}", h.key, h.value))
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.toggle_header(space_id, h_id, cx);
                                }),
                            )
                    }),
                ),
            )
            .child(
                // Body Selection
                div().flex().flex_col().gap_2().child("Body").children(
                    workspace.bodies.iter().enumerate().map(|(i, b)| {
                        let selected = space.selected_body_id == Some(b.id);
                        let b_id = b.id;
                        div()
                            .id(SharedString::from(format!("b-{}", i)))
                            .flex()
                            .items_center()
                            .gap_2()
                            .p_1()
                            .bg(if selected {
                                rgb(0x2a2a2a)
                            } else {
                                rgb(0x1e1e1e)
                            })
                            .cursor_pointer()
                            .child(b.name.clone())
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.select_body(space_id, b_id, cx);
                                }),
                            )
                    }),
                ),
            )
            .child(
                div()
                    .id("send-btn")
                    .mt_4()
                    .p_2()
                    .bg(rgb(0x4488ff))
                    .text_color(rgb(0xffffff))
                    .rounded_md()
                    .flex()
                    .justify_center()
                    .cursor_pointer()
                    .child("Send Request")
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, _, _, cx| {
                            this.send_request(cx);
                        }),
                    ),
            )
    }

    fn render_response_area(&self, space: &Space, _cx: &Context<Self>) -> impl IntoElement {
        if let Some(last_response) = space.history.first() {
            div()
                .mt_4()
                .p_4()
                .border_1()
                .border_color(rgb(0x444444))
                .rounded_md()
                .child(div().font_weight(FontWeight::BOLD).mb_2().child(format!(
                    "Response: {} ({}ms)",
                    last_response.status, last_response.duration_ms
                )))
                .child(
                    div()
                        .p_2()
                        .bg(rgb(0x111111))
                        .text_sm()
                        .font_family("Courier New")
                        .child(last_response.body.clone()),
                )
        } else {
            div().mt_4().child("No response yet")
        }
    }
}

impl Render for LightweightPostman {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .size_full()
            .bg(rgb(0x1e1e1e))
            .text_color(rgb(0xffffff))
            .child(self.render_sidebar(cx))
            .child(self.render_main(cx))
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        cx.open_window(WindowOptions::default(), |_, cx| {
            cx.new(LightweightPostman::new)
        })
        .unwrap();
    });
}
