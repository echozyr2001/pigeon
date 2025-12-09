use gpui::prelude::*;
use gpui::Rgba;
use gpui::*;

#[derive(Clone, Copy)]
pub struct HistoryEntryCardStyle {
    pub background: Rgba,
    pub highlight_background: Rgba,
    pub border: Rgba,
    pub secondary_text: Rgba,
    pub duration_text: Rgba,
}

impl Default for HistoryEntryCardStyle {
    fn default() -> Self {
        Self {
            background: rgb(0x141414),
            highlight_background: rgb(0x181818),
            border: rgb(0x262626),
            secondary_text: rgb(0x777777),
            duration_text: rgb(0x666666),
        }
    }
}

#[derive(IntoElement)]
pub struct HistoryEntryCard {
    id: ElementId,
    status: u16,
    status_text: SharedString,
    timestamp: SharedString,
    duration_ms: u64,
    highlighted: bool,
    style: HistoryEntryCardStyle,
}

impl HistoryEntryCard {
    pub fn new(
        id: impl Into<ElementId>,
        status: u16,
        status_text: impl Into<SharedString>,
        timestamp: impl Into<SharedString>,
        duration_ms: u64,
        highlighted: bool,
    ) -> Self {
        Self {
            id: id.into(),
            status,
            status_text: status_text.into(),
            timestamp: timestamp.into(),
            duration_ms,
            highlighted,
            style: HistoryEntryCardStyle::default(),
        }
    }

    pub fn style(mut self, style: HistoryEntryCardStyle) -> Self {
        self.style = style;
        self
    }
}

impl RenderOnce for HistoryEntryCard {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        let style = self.style;
        let background = if self.highlighted {
            style.highlight_background
        } else {
            style.background
        };

        div()
            .id(self.id)
            .flex()
            .items_center()
            .justify_between()
            .p_2()
            .rounded_md()
            .border_1()
            .border_color(style.border)
            .bg(background)
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(div().child(format!("{} {}", self.status, self.status_text)))
                    .child(
                        div()
                            .text_xs()
                            .text_color(style.secondary_text)
                            .child(self.timestamp),
                    ),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(style.duration_text)
                    .child(format!("{} ms", self.duration_ms)),
            )
    }
}
