use gpui::prelude::*;
use gpui::{AnyElement, Rgba, *};
use std::sync::OnceLock;
use uuid::Uuid;

mod components;
mod model;
use components::history_entry_card::HistoryEntryCardStyle;
use components::text_input::{
    create_form_text_input, register_form_input_keybindings, FormTextInput,
};
use components::HistoryEntryCard;
use model::{Body, Endpoint, Header, ResponseData, Space, Workspace};

static TOKIO_RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn get_tokio_runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ThemeMode {
    Light,
    Dark,
}

impl ThemeMode {
    fn toggle(self) -> Self {
        match self {
            ThemeMode::Light => ThemeMode::Dark,
            ThemeMode::Dark => ThemeMode::Light,
        }
    }

    fn palette(self) -> ThemePalette {
        match self {
            ThemeMode::Light => ThemePalette {
                app_bg: rgb(0xf5f6fb),
                text_primary: rgb(0x111111),
                text_secondary: rgb(0x5c6370),
                sidebar_bg: rgb(0xffffff),
                sidebar_border: rgb(0xd6dae8),
                sidebar_item_active: rgb(0xe8ecfd),
                sidebar_item_hover: rgb(0xf2f5ff),
                catalog_card_bg: rgb(0xffffff),
                card_bg: rgb(0xffffff),
                card_border: rgb(0xdfe3ef),
                muted_bg: rgb(0xf3f6fd),
                accent: rgb(0x2d5cff),
                accent_subtle: rgb(0xdfe7ff),
                history_highlight_bg: rgb(0xffffff),
                history_bg: rgb(0xf5f6fb),
                success_badge: rgb(0x1f8a70),
                error_badge: rgb(0xd14343),
            },
            ThemeMode::Dark => ThemePalette {
                app_bg: rgb(0x1e1e1e),
                text_primary: rgb(0xffffff),
                text_secondary: rgb(0x888888),
                sidebar_bg: rgb(0x1e1e1e),
                sidebar_border: rgb(0x333333),
                sidebar_item_active: rgb(0x333333),
                sidebar_item_hover: rgb(0x2a2a2a),
                catalog_card_bg: rgb(0x101010),
                card_bg: rgb(0x101010),
                card_border: rgb(0x2a2a2a),
                muted_bg: rgb(0x151515),
                accent: rgb(0x2d5cff),
                accent_subtle: rgb(0x303a60),
                history_highlight_bg: rgb(0x181818),
                history_bg: rgb(0x141414),
                success_badge: rgb(0x1f8a70),
                error_badge: rgb(0x8a2f39),
            },
        }
    }
}

#[derive(Clone, Copy)]
struct ThemePalette {
    app_bg: Rgba,
    text_primary: Rgba,
    text_secondary: Rgba,
    sidebar_bg: Rgba,
    sidebar_border: Rgba,
    sidebar_item_active: Rgba,
    sidebar_item_hover: Rgba,
    catalog_card_bg: Rgba,
    card_bg: Rgba,
    card_border: Rgba,
    muted_bg: Rgba,
    accent: Rgba,
    accent_subtle: Rgba,
    history_highlight_bg: Rgba,
    history_bg: Rgba,
    success_badge: Rgba,
    error_badge: Rgba,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LibraryTab {
    Endpoints,
    Headers,
    Bodies,
}

struct LightweightPostman {
    workspace: Entity<Workspace>,
    active_space_id: Option<Uuid>,
    theme_mode: ThemeMode,
    active_library_tab: LibraryTab,
    creation_form_open: bool,
    endpoint_form: EndpointForm,
    header_form: HeaderForm,
    body_form: BodyForm,
}

impl LightweightPostman {
    fn new(cx: &mut Context<Self>) -> Self {
        let workspace = cx.new(|_| Workspace::default());
        register_form_input_keybindings(cx);
        let endpoint_form = EndpointForm::new(cx);
        let header_form = HeaderForm::new(cx);
        let body_form = BodyForm::new(cx);
        Self {
            workspace,
            active_space_id: None,
            theme_mode: ThemeMode::Light,
            active_library_tab: LibraryTab::Endpoints,
            creation_form_open: false,
            endpoint_form,
            header_form,
            body_form,
        }
    }
    fn toggle_theme(&mut self, cx: &mut Context<Self>) {
        self.theme_mode = self.theme_mode.toggle();
        cx.notify();
    }

    fn palette(&self) -> ThemePalette {
        self.theme_mode.palette()
    }

    fn select_library_tab(&mut self, tab: LibraryTab, cx: &mut Context<Self>) {
        if self.active_library_tab != tab {
            self.active_library_tab = tab;
            cx.notify();
        }
    }

    fn toggle_creation_form(&mut self, cx: &mut Context<Self>) {
        if self.creation_form_open {
            self.close_creation_form(cx);
        } else {
            self.reset_active_form(cx);
            self.clear_form_errors();
            self.creation_form_open = true;
            cx.notify();
        }
    }

    fn close_creation_form(&mut self, cx: &mut Context<Self>) {
        self.reset_active_form(cx);
        self.clear_form_errors();
        self.creation_form_open = false;
        cx.notify();
    }

    fn reset_active_form(&mut self, cx: &mut Context<Self>) {
        match self.active_library_tab {
            LibraryTab::Endpoints => self.endpoint_form.reset(cx),
            LibraryTab::Headers => self.header_form.reset(cx),
            LibraryTab::Bodies => self.body_form.reset(cx),
        }
    }

    fn clear_form_errors(&mut self) {
        self.endpoint_form.error = None;
        self.header_form.error = None;
        self.body_form.error = None;
    }

    fn submit_form_click(&mut self, _: &MouseDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.submit_active_form(cx);
    }

    fn cancel_form_click(&mut self, _: &MouseDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.close_creation_form(cx);
    }

    fn submit_active_form(&mut self, cx: &mut Context<Self>) {
        let saved = match self.active_library_tab {
            LibraryTab::Endpoints => self.submit_endpoint_form(cx),
            LibraryTab::Headers => self.submit_header_form(cx),
            LibraryTab::Bodies => self.submit_body_form(cx),
        };

        if saved {
            self.creation_form_open = false;
            self.clear_form_errors();
            cx.notify();
        }
    }

    fn submit_endpoint_form(&mut self, cx: &mut Context<Self>) -> bool {
        let name = self.endpoint_form.name.read(cx).text();
        let method = self.endpoint_form.method.read(cx).text();
        let url = self.endpoint_form.url.read(cx).text();

        let name = name.trim();
        let method = method.trim();
        let url = url.trim();

        if name.is_empty() || method.is_empty() || url.is_empty() {
            self.endpoint_form.error = Some("请填写完整的名称、方法与 URL".to_string());
            cx.notify();
            return false;
        }

        let endpoint = Endpoint {
            id: Uuid::new_v4(),
            name: name.to_string(),
            method: method.to_uppercase(),
            url: url.to_string(),
        };

        self.workspace.update(cx, |ws, _| {
            ws.endpoints.push(endpoint);
        });
        self.endpoint_form.reset(cx);
        true
    }

    fn submit_header_form(&mut self, cx: &mut Context<Self>) -> bool {
        let name = self.header_form.name.read(cx).text();
        let key = self.header_form.key.read(cx).text();
        let value = self.header_form.value.read(cx).text();

        let key_trimmed = key.trim();
        let value_trimmed = value.trim();
        if key_trimmed.is_empty() || value_trimmed.is_empty() {
            self.header_form.error = Some("Header key 与 value 必填".to_string());
            cx.notify();
            return false;
        }

        let header_name = if name.trim().is_empty() {
            key_trimmed.to_string()
        } else {
            name.trim().to_string()
        };

        let header = Header {
            id: Uuid::new_v4(),
            name: header_name,
            key: key_trimmed.to_string(),
            value: value_trimmed.to_string(),
            enabled: true,
        };

        self.workspace.update(cx, |ws, _| ws.headers.push(header));
        self.header_form.reset(cx);
        true
    }

    fn submit_body_form(&mut self, cx: &mut Context<Self>) -> bool {
        let name = self.body_form.name.read(cx).text();
        let content_type = self.body_form.content_type.read(cx).text();
        let content = self.body_form.content.read(cx).text();

        if name.trim().is_empty() || content_type.trim().is_empty() {
            self.body_form.error = Some("Body 名称与 Content-Type 必填".to_string());
            cx.notify();
            return false;
        }

        let body = Body {
            id: Uuid::new_v4(),
            name: name.trim().to_string(),
            content_type: content_type.trim().to_string(),
            content,
        };

        self.workspace.update(cx, |ws, _| ws.bodies.push(body));
        self.body_form.reset(cx);
        true
    }

    fn create_space(&mut self, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            let mut space = Space::default();
            space.name = format!("Space {}", ws.spaces.len() + 1);
            ws.spaces.push(space);
        });
        cx.notify();
    }

    fn delete_endpoint(&mut self, id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            ws.endpoints.retain(|e| e.id != id);
            for space in &mut ws.spaces {
                if space.selected_endpoint_id == Some(id) {
                    space.selected_endpoint_id = None;
                }
            }
        });
        cx.notify();
    }

    fn delete_header(&mut self, id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            ws.headers.retain(|h| h.id != id);
            for space in &mut ws.spaces {
                space.selected_header_ids.retain(|existing| *existing != id);
            }
        });
        cx.notify();
    }

    fn delete_body(&mut self, id: Uuid, cx: &mut Context<Self>) {
        self.workspace.update(cx, |ws, _| {
            ws.bodies.retain(|b| b.id != id);
            for space in &mut ws.spaces {
                if space.selected_body_id == Some(id) {
                    space.selected_body_id = None;
                }
            }
        });
        cx.notify();
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

        let mut should_start = false;
        self.workspace.update(cx, |ws, _| {
            if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                if !space.is_request_pending {
                    space.is_request_pending = true;
                    should_start = true;
                }
            }
        });

        if !should_start {
            return;
        }
        cx.notify();

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

                let response_data = handle.await.ok();

                cx.update(|cx| {
                    workspace_entity.update(cx, |ws, _| {
                        if let Some(space) = ws.spaces.iter_mut().find(|s| s.id == space_id) {
                            space.is_request_pending = false;
                            if let Some(response_data) = response_data.clone() {
                                space.history.insert(0, response_data);
                                if space.history.len() > 10 {
                                    space.history.pop();
                                }
                            }
                        }
                    });
                })
                .ok();
            }
        })
        .detach();
    }

    fn render_sidebar(&self, cx: &Context<Self>) -> impl IntoElement {
        let workspace = self.workspace.read(cx);
        let palette = self.palette();

        div()
            .w_64()
            .h_full()
            .border_r_1()
            .border_color(palette.sidebar_border)
            .bg(palette.sidebar_bg)
            .flex()
            .flex_col()
            .child(
                div()
                    .p_4()
                    .border_b_1()
                    .border_color(palette.sidebar_border)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().font_weight(FontWeight::BOLD).child("Workspace"))
                    .child(
                        div()
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .bg(palette.accent)
                            .text_color(rgb(0xffffff))
                            .cursor_pointer()
                            .text_xs()
                            .child(match self.theme_mode {
                                ThemeMode::Light => "Dark",
                                ThemeMode::Dark => "Light",
                            })
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _, _, cx| {
                                    this.toggle_theme(cx);
                                }),
                            ),
                    )
                    .child(
                        div()
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .bg(palette.accent)
                            .text_color(rgb(0xffffff))
                            .cursor_pointer()
                            .text_xs()
                            .child("Add Space")
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _, _, cx| {
                                    this.create_space(cx);
                                }),
                            ),
                    ),
            )
            .child(
                div()
                    .p_2()
                    .child(div().font_weight(FontWeight::BOLD).mb_2().child("Spaces"))
                    .children(workspace.spaces.iter().enumerate().map(|(i, space)| {
                        let is_active = self.active_space_id == Some(space.id);
                        let id = space.id;
                        div()
                            .id(i)
                            .p_2()
                            .rounded_md()
                            .bg(if is_active {
                                palette.sidebar_item_active
                            } else {
                                palette.sidebar_bg
                            })
                            .text_color(palette.text_primary)
                            .hover(|s| s.bg(palette.sidebar_item_hover))
                            .border_1()
                            .border_color(palette.sidebar_border)
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
        let palette = self.palette();

        if let Some(space_id) = self.active_space_id {
            if let Some(space) = workspace.spaces.iter().find(|s| s.id == space_id) {
                return div()
                    .flex_1()
                    .flex()
                    .flex_wrap()
                    .items_start()
                    .gap_4()
                    .p_4()
                    .bg(palette.muted_bg)
                    .child(self.render_workspace_catalog(&workspace, palette, cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w(px(360.))
                            .flex()
                            .flex_col()
                            .gap_4()
                            .child(self.render_space_header(space, cx, palette))
                            .child(
                                div()
                                    .flex()
                                    .flex_wrap()
                                    .items_start()
                                    .gap_4()
                                    .child(
                                        div()
                                            .flex_1()
                                            .flex()
                                            .flex_col()
                                            .gap_4()
                                            .child(
                                                self.render_space_form(
                                                    space, workspace, cx, palette,
                                                ),
                                            )
                                            .child(self.render_response_area(space, palette)),
                                    )
                                    .child(self.render_history(space, palette)),
                            ),
                    );
            }
        }

        div()
            .flex_1()
            .flex()
            .items_center()
            .justify_center()
            .child("Select a Space to start")
    }

    fn render_workspace_catalog(
        &self,
        workspace: &Workspace,
        palette: ThemePalette,
        cx: &Context<Self>,
    ) -> impl IntoElement {
        let definition_count = format!(
            "{} definitions",
            workspace.endpoints.len() + workspace.headers.len() + workspace.bodies.len()
        );

        let mut catalog = div()
            .w_80()
            .min_w_72()
            .flex_shrink_0()
            .rounded_lg()
            .border_1()
            .border_color(palette.card_border)
            .bg(palette.catalog_card_bg)
            .p_4()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child("Workspace Library"),
                    )
                    .child(
                        div()
                            .px_2()
                            .py_1()
                            .rounded_full()
                            .bg(palette.muted_bg)
                            .text_sm()
                            .child(definition_count),
                    ),
            )
            .child({
                let tab_buttons: Vec<AnyElement> = ["Endpoints", "Headers", "Bodies"]
                    .into_iter()
                    .enumerate()
                    .map(|(idx, label)| {
                        let tab = match idx {
                            0 => LibraryTab::Endpoints,
                            1 => LibraryTab::Headers,
                            _ => LibraryTab::Bodies,
                        };
                        let active = self.active_library_tab == tab;
                        div()
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .border_1()
                            .border_color(if active {
                                palette.accent
                            } else {
                                palette.card_border
                            })
                            .bg(if active {
                                palette.accent_subtle
                            } else {
                                palette.card_bg
                            })
                            .text_color(if active {
                                palette.accent
                            } else {
                                palette.text_secondary
                            })
                            .cursor_pointer()
                            .child(label)
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, _, _, cx| {
                                    this.select_library_tab(tab, cx);
                                }),
                            )
                            .into_any_element()
                    })
                    .collect();

                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().flex().items_center().gap_2().children(tab_buttons))
                    .child(div().flex_1())
                    .child(
                        div()
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .bg(palette.accent)
                            .text_color(rgb(0xffffff))
                            .cursor_pointer()
                            .child(if self.creation_form_open {
                                "Hide Form"
                            } else {
                                "Create"
                            })
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _, _, cx| {
                                    this.toggle_creation_form(cx);
                                }),
                            ),
                    )
            })
            .child(match self.active_library_tab {
                LibraryTab::Endpoints => self.render_endpoint_library(workspace, palette, cx),
                LibraryTab::Headers => self.render_header_library(workspace, palette, cx),
                LibraryTab::Bodies => self.render_body_library(workspace, palette, cx),
            });

        if self.creation_form_open {
            catalog = catalog.child(self.render_creation_form(palette, cx));
        }

        catalog
    }

    fn render_creation_form(&self, palette: ThemePalette, cx: &Context<Self>) -> AnyElement {
        let (title, description) = match self.active_library_tab {
            LibraryTab::Endpoints => ("新建 Endpoint", "填写名称、方法与 URL 后保存到库中。"),
            LibraryTab::Headers => ("新建 Header", "配置常用 Header 键值对。"),
            LibraryTab::Bodies => ("新建 Body", "保存常见请求体以便复用。"),
        };

        let form_fields: Div = match self.active_library_tab {
            LibraryTab::Endpoints => self.render_endpoint_form(palette),
            LibraryTab::Headers => self.render_header_form(palette),
            LibraryTab::Bodies => self.render_body_form(palette),
        };

        div()
            .pt_2()
            .child(
                div()
                    .border_1()
                    .border_color(palette.card_border)
                    .bg(palette.card_bg)
                    .rounded_md()
                    .p_4()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_1()
                            .child(
                                div()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(palette.text_primary)
                                    .child(title),
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(palette.text_secondary)
                                    .child(description),
                            ),
                    )
                    .child(form_fields)
                    .child(
                        div()
                            .flex()
                            .justify_end()
                            .gap_2()
                            .child(self.secondary_button("取消", palette).on_mouse_down(
                                MouseButton::Left,
                                cx.listener(Self::cancel_form_click),
                            ))
                            .child(self.primary_button("保存", palette).on_mouse_down(
                                MouseButton::Left,
                                cx.listener(Self::submit_form_click),
                            )),
                    ),
            )
            .into_any_element()
    }

    fn render_endpoint_form(&self, palette: ThemePalette) -> Div {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .child(self.labeled_input("名称", palette, self.endpoint_form.name.clone()))
            .child(self.labeled_input("HTTP 方法", palette, self.endpoint_form.method.clone()))
            .child(self.labeled_input("URL", palette, self.endpoint_form.url.clone()))
            .when_some(self.endpoint_form.error.as_ref(), |form, error| {
                form.child(
                    div()
                        .text_sm()
                        .text_color(palette.error_badge)
                        .child(error.clone()),
                )
            })
    }

    fn render_header_form(&self, palette: ThemePalette) -> Div {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .child(self.labeled_input("别名", palette, self.header_form.name.clone()))
            .child(self.labeled_input("Header Key", palette, self.header_form.key.clone()))
            .child(self.labeled_input("Header Value", palette, self.header_form.value.clone()))
            .when_some(self.header_form.error.as_ref(), |form, error| {
                form.child(
                    div()
                        .text_sm()
                        .text_color(palette.error_badge)
                        .child(error.clone()),
                )
            })
    }

    fn render_body_form(&self, palette: ThemePalette) -> Div {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .child(self.labeled_input("名称", palette, self.body_form.name.clone()))
            .child(self.labeled_input("Content-Type", palette, self.body_form.content_type.clone()))
            .child(self.labeled_input("内容", palette, self.body_form.content.clone()))
            .when_some(self.body_form.error.as_ref(), |form, error| {
                form.child(
                    div()
                        .text_sm()
                        .text_color(palette.error_badge)
                        .child(error.clone()),
                )
            })
    }

    fn labeled_input(
        &self,
        label: &str,
        palette: ThemePalette,
        input: Entity<FormTextInput>,
    ) -> Div {
        div()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .text_sm()
                    .text_color(palette.text_secondary)
                    .child(label.to_string()),
            )
            .child(input)
    }

    fn primary_button(&self, label: &str, palette: ThemePalette) -> Div {
        div()
            .px_4()
            .py_2()
            .rounded_md()
            .bg(palette.accent)
            .text_color(rgb(0xffffff))
            .text_sm()
            .cursor_pointer()
            .child(label.to_string())
    }

    fn secondary_button(&self, label: &str, palette: ThemePalette) -> Div {
        div()
            .px_4()
            .py_2()
            .rounded_md()
            .border_1()
            .border_color(palette.card_border)
            .text_color(palette.text_secondary)
            .text_sm()
            .cursor_pointer()
            .child(label.to_string())
    }

    fn render_endpoint_library(
        &self,
        workspace: &Workspace,
        palette: ThemePalette,
        cx: &Context<Self>,
    ) -> AnyElement {
        if workspace.endpoints.is_empty() {
            return div()
                .text_color(palette.text_secondary)
                .child("No endpoints yet. Click Create to add one.")
                .into_any_element();
        }

        div()
            .flex()
            .flex_wrap()
            .gap_3()
            .children(workspace.endpoints.iter().map(|endpoint| {
                let id = endpoint.id;
                div()
                    .id(id)
                    .w(px(220.))
                    .border_1()
                    .border_color(palette.card_border)
                    .bg(palette.card_bg)
                    .rounded_lg()
                    .p_3()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(endpoint.name.clone()),
                            )
                            .child(
                                div()
                                    .text_color(palette.text_secondary)
                                    .cursor_pointer()
                                    .child("✕")
                                    .on_mouse_down(
                                        MouseButton::Left,
                                        cx.listener(move |this, _, _, cx| {
                                            this.delete_endpoint(id, cx);
                                        }),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .child(
                                div()
                                    .px_2()
                                    .py_1()
                                    .rounded_sm()
                                    .bg(palette.accent_subtle)
                                    .text_color(palette.accent)
                                    .text_xs()
                                    .child(endpoint.method.clone()),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(palette.text_secondary)
                                    .child(endpoint.url.clone()),
                            ),
                    )
            }))
            .into_any_element()
    }

    fn render_header_library(
        &self,
        workspace: &Workspace,
        palette: ThemePalette,
        cx: &Context<Self>,
    ) -> AnyElement {
        if workspace.headers.is_empty() {
            return div()
                .text_color(palette.text_secondary)
                .child("No headers yet. Click Create to add one.")
                .into_any_element();
        }

        div()
            .flex()
            .flex_col()
            .gap_3()
            .children(workspace.headers.iter().map(|header| {
                let id = header.id;
                div()
                    .id(id)
                    .border_1()
                    .border_color(palette.card_border)
                    .bg(palette.card_bg)
                    .rounded_lg()
                    .p_3()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(header.name.clone()),
                            )
                            .child(
                                div()
                                    .text_color(palette.text_secondary)
                                    .cursor_pointer()
                                    .child("✕")
                                    .on_mouse_down(
                                        MouseButton::Left,
                                        cx.listener(move |this, _, _, cx| {
                                            this.delete_header(id, cx);
                                        }),
                                    ),
                            ),
                    )
                    .child(
                        div().flex().items_center().gap_2().child(
                            div()
                                .flex_1()
                                .text_color(palette.text_secondary)
                                .child(format!("{}: {}", header.key, header.value)),
                        ),
                    )
            }))
            .into_any_element()
    }

    fn render_body_library(
        &self,
        workspace: &Workspace,
        palette: ThemePalette,
        cx: &Context<Self>,
    ) -> AnyElement {
        if workspace.bodies.is_empty() {
            return div()
                .text_color(palette.text_secondary)
                .child("No bodies yet. Click Create to add one.")
                .into_any_element();
        }

        div()
            .flex()
            .flex_wrap()
            .gap_3()
            .children(workspace.bodies.iter().map(|body| {
                let id = body.id;
                div()
                    .id(id)
                    .w(px(240.))
                    .border_1()
                    .border_color(palette.card_border)
                    .bg(palette.card_bg)
                    .rounded_lg()
                    .p_3()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(body.name.clone()),
                            )
                            .child(
                                div()
                                    .text_color(palette.text_secondary)
                                    .cursor_pointer()
                                    .child("✕")
                                    .on_mouse_down(
                                        MouseButton::Left,
                                        cx.listener(move |this, _, _, cx| {
                                            this.delete_body(id, cx);
                                        }),
                                    ),
                            ),
                    )
                    .child(
                        div().flex().items_center().gap_2().child(
                            div()
                                .px_2()
                                .py_1()
                                .rounded_sm()
                                .bg(palette.muted_bg)
                                .text_xs()
                                .text_color(palette.text_secondary)
                                .child(body.content_type.clone()),
                        ),
                    )
                    .child(
                        div()
                            .border_1()
                            .border_color(palette.card_border)
                            .bg(palette.muted_bg)
                            .p_2()
                            .rounded_md()
                            .text_xs()
                            .font_family("Courier New")
                            .child(body.content.clone()),
                    )
            }))
            .into_any_element()
    }

    fn render_space_header(
        &self,
        space: &Space,
        cx: &Context<Self>,
        palette: ThemePalette,
    ) -> impl IntoElement {
        let is_pending = space.is_request_pending;
        div()
            .p_4()
            .rounded_lg()
            .border_1()
            .border_color(palette.card_border)
            .bg(palette.card_bg)
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child("Space"),
                    )
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .child(space.name.clone()),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child(format!("{} responses stored", space.history.len())),
                    )
                    .child(
                        div()
                            .px_4()
                            .py_2()
                            .rounded_md()
                            .bg(if is_pending {
                                palette.accent_subtle
                            } else {
                                palette.accent
                            })
                            .text_color(rgb(0xffffff))
                            .opacity(if is_pending { 0.7 } else { 1.0 })
                            .cursor_pointer()
                            .child(if is_pending {
                                "Sending..."
                            } else {
                                "Send Request"
                            })
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _, _, cx| {
                                    this.send_request(cx);
                                }),
                            ),
                    ),
            )
    }

    fn render_space_form(
        &self,
        space: &Space,
        workspace: &Workspace,
        cx: &Context<Self>,
        palette: ThemePalette,
    ) -> impl IntoElement {
        let space_id = space.id;

        div()
            .flex()
            .flex_wrap()
            .items_start()
            .gap_4()
            .child(
                div()
                    .flex_1()
                    .min_w(px(320.))
                    .flex()
                    .flex_col()
                    .gap_3()
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child("Endpoint"),
                    )
                    .child(div().flex().flex_col().gap_2().children(
                        workspace.endpoints.iter().enumerate().map(|(i, ep)| {
                            let selected = space.selected_endpoint_id == Some(ep.id);
                            let ep_id = ep.id;
                            div()
                                .id(SharedString::from(format!("ep-{}", i)))
                                .flex()
                                .items_center()
                                .gap_3()
                                .p_3()
                                .rounded_lg()
                                .border_1()
                                .border_color(if selected {
                                    palette.accent
                                } else {
                                    palette.card_border
                                })
                                .bg(if selected {
                                    palette.accent_subtle
                                } else {
                                    palette.card_bg
                                })
                                .cursor_pointer()
                                .child(
                                    div()
                                        .rounded_full()
                                        .px_3()
                                        .py_1()
                                        .text_xs()
                                        .bg(palette.accent)
                                        .text_color(rgb(0xffffff))
                                        .child(ep.method.clone().to_uppercase()),
                                )
                                .child(
                                    div()
                                        .flex_1()
                                        .flex()
                                        .flex_col()
                                        .gap_1()
                                        .child(
                                            div()
                                                .font_weight(FontWeight::MEDIUM)
                                                .child(ep.name.clone()),
                                        )
                                        .child(
                                            div()
                                                .text_xs()
                                                .text_color(palette.text_secondary)
                                                .child(ep.url.clone()),
                                        ),
                                )
                                .on_mouse_down(
                                    MouseButton::Left,
                                    cx.listener(move |this, _, _, cx| {
                                        this.select_endpoint(space_id, ep_id, cx);
                                    }),
                                )
                        }),
                    )),
            )
            .child(
                div()
                    .min_w(px(240.))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child("Headers"),
                    )
                    .child(div().flex().flex_col().gap_2().children(
                        workspace.headers.iter().enumerate().map(|(i, header)| {
                            let selected = space.selected_header_ids.contains(&header.id);
                            let header_id = header.id;
                            div()
                                .id(SharedString::from(format!("h-{}", i)))
                                .flex()
                                .items_center()
                                .gap_2()
                                .p_2()
                                .rounded_md()
                                .border_1()
                                .border_color(if selected {
                                    palette.accent
                                } else {
                                    palette.card_border
                                })
                                .bg(palette.card_bg)
                                .cursor_pointer()
                                .child(div().child(if selected { "●" } else { "○" }))
                                .child(
                                    div()
                                        .flex_1()
                                        .child(format!("{}: {}", header.key, header.value)),
                                )
                                .on_mouse_down(
                                    MouseButton::Left,
                                    cx.listener(move |this, _, _, cx| {
                                        this.toggle_header(space_id, header_id, cx);
                                    }),
                                )
                        }),
                    ))
                    .child(
                        div()
                            .text_sm()
                            .text_color(palette.text_secondary)
                            .child("Body"),
                    )
                    .child(div().flex().flex_col().gap_2().children(
                        workspace.bodies.iter().enumerate().map(|(i, body)| {
                            let selected = space.selected_body_id == Some(body.id);
                            let body_id = body.id;
                            div()
                                .id(SharedString::from(format!("b-{}", i)))
                                .flex()
                                .items_center()
                                .gap_2()
                                .p_2()
                                .rounded_md()
                                .border_1()
                                .border_color(if selected {
                                    palette.accent
                                } else {
                                    palette.card_border
                                })
                                .bg(palette.card_bg)
                                .cursor_pointer()
                                .child(div().child(if selected { "●" } else { "○" }))
                                .child(div().flex_1().child(body.name.clone()))
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(palette.text_secondary)
                                        .child(body.content_type.clone()),
                                )
                                .on_mouse_down(
                                    MouseButton::Left,
                                    cx.listener(move |this, _, _, cx| {
                                        this.select_body(space_id, body_id, cx);
                                    }),
                                )
                        }),
                    )),
            )
    }

    fn render_response_area(&self, space: &Space, palette: ThemePalette) -> impl IntoElement {
        if let Some(last_response) = space.history.first() {
            div()
                .p_4()
                .rounded_lg()
                .border_1()
                .border_color(palette.card_border)
                .bg(palette.card_bg)
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .mb_3()
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap_3()
                                .child(
                                    div()
                                        .rounded_full()
                                        .px_3()
                                        .py_1()
                                        .bg(if last_response.status < 400 {
                                            palette.success_badge
                                        } else {
                                            palette.error_badge
                                        })
                                        .child(last_response.status.to_string()),
                                )
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(palette.text_secondary)
                                        .child(last_response.status_text.clone()),
                                ),
                        )
                        .child(
                            div()
                                .text_sm()
                                .text_color(palette.text_secondary)
                                .child(format!("{} ms", last_response.duration_ms)),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .gap_4()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap_1()
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(palette.text_secondary)
                                        .child("Received"),
                                )
                                .child(
                                    div().text_sm().child(
                                        last_response
                                            .timestamp
                                            .format("%Y-%m-%d %H:%M:%S")
                                            .to_string(),
                                    ),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap_1()
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(palette.text_secondary)
                                        .child("Headers"),
                                )
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(palette.text_secondary)
                                        .child(format!("{} entries", last_response.headers.len())),
                                ),
                        ),
                )
                .child(
                    div()
                        .mt_3()
                        .p_3()
                        .rounded_md()
                        .bg(palette.muted_bg)
                        .text_sm()
                        .font_family("Courier New")
                        .child(last_response.body.clone()),
                )
        } else {
            div()
                .p_4()
                .rounded_lg()
                .border_1()
                .border_color(palette.card_border)
                .bg(palette.card_bg)
                .child("No response yet")
        }
    }

    fn render_history(&self, space: &Space, palette: ThemePalette) -> impl IntoElement {
        let history_style = HistoryEntryCardStyle {
            background: palette.history_bg,
            highlight_background: palette.history_highlight_bg,
            border: palette.card_border,
            secondary_text: palette.text_secondary,
            duration_text: palette.text_secondary,
        };

        div()
            .w_72()
            .min_w(px(280.))
            .flex_shrink_0()
            .rounded_lg()
            .border_1()
            .border_color(palette.card_border)
            .bg(palette.card_bg)
            .p_4()
            .flex()
            .flex_col()
            .gap_3()
            .child(
                div()
                    .text_sm()
                    .text_color(palette.text_secondary)
                    .child("Recent responses"),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .children(space.history.iter().enumerate().map(|(index, response)| {
                        HistoryEntryCard::new(
                            ("history-entry", index),
                            response.status,
                            response.status_text.clone(),
                            response.timestamp.format("%H:%M:%S").to_string(),
                            response.duration_ms,
                            index == 0,
                        )
                        .style(history_style)
                        .into_element()
                    })),
            )
    }
}

impl Render for LightweightPostman {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let palette = self.palette();
        div()
            .flex()
            .size_full()
            .bg(palette.app_bg)
            .text_color(palette.text_primary)
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

struct EndpointForm {
    name: Entity<FormTextInput>,
    method: Entity<FormTextInput>,
    url: Entity<FormTextInput>,
    error: Option<String>,
}

impl EndpointForm {
    fn new(cx: &mut Context<LightweightPostman>) -> Self {
        Self {
            name: create_form_text_input(cx, "名称", ""),
            method: create_form_text_input(cx, "HTTP 方法 (GET/POST...)", "GET"),
            url: create_form_text_input(cx, "https://example.com/api", ""),
            error: None,
        }
    }

    fn reset(&mut self, cx: &mut Context<LightweightPostman>) {
        self.name.update(cx, |input, cx| input.clear(cx));
        self.method
            .update(cx, |input, cx| input.set_text("GET", cx));
        self.url.update(cx, |input, cx| input.clear(cx));
        self.error = None;
    }
}

struct HeaderForm {
    name: Entity<FormTextInput>,
    key: Entity<FormTextInput>,
    value: Entity<FormTextInput>,
    error: Option<String>,
}

impl HeaderForm {
    fn new(cx: &mut Context<LightweightPostman>) -> Self {
        Self {
            name: create_form_text_input(cx, "别名（可选）", ""),
            key: create_form_text_input(cx, "Header Key", ""),
            value: create_form_text_input(cx, "Header Value", ""),
            error: None,
        }
    }

    fn reset(&mut self, cx: &mut Context<LightweightPostman>) {
        self.name.update(cx, |input, cx| input.clear(cx));
        self.key.update(cx, |input, cx| input.clear(cx));
        self.value.update(cx, |input, cx| input.clear(cx));
        self.error = None;
    }
}

struct BodyForm {
    name: Entity<FormTextInput>,
    content_type: Entity<FormTextInput>,
    content: Entity<FormTextInput>,
    error: Option<String>,
}

impl BodyForm {
    fn new(cx: &mut Context<LightweightPostman>) -> Self {
        Self {
            name: create_form_text_input(cx, "名称", ""),
            content_type: create_form_text_input(cx, "Content-Type", "application/json"),
            content: create_form_text_input(cx, "内容", "{}"),
            error: None,
        }
    }

    fn reset(&mut self, cx: &mut Context<LightweightPostman>) {
        self.name.update(cx, |input, cx| input.clear(cx));
        self.content_type
            .update(cx, |input, cx| input.set_text("application/json", cx));
        self.content
            .update(cx, |input, cx| input.set_text("{}", cx));
        self.error = None;
    }
}
