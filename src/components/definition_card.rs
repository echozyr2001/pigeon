use gpui::prelude::*;
use gpui::Rgba;
use gpui::*;

#[derive(Clone, Copy)]
pub struct DefinitionCardStyle {
    pub background: Rgba,
    pub border: Rgba,
    pub secondary_text: Rgba,
}

impl Default for DefinitionCardStyle {
    fn default() -> Self {
        Self {
            background: rgb(0x151515),
            border: rgb(0x262626),
            secondary_text: rgb(0x777777),
        }
    }
}

#[derive(IntoElement)]
pub struct DefinitionCard {
    id: ElementId,
    title: SharedString,
    subtitle: Option<SharedString>,
    badge: Option<(SharedString, Rgba)>,
    style: DefinitionCardStyle,
}

impl DefinitionCard {
    pub fn new(id: impl Into<ElementId>, title: impl Into<SharedString>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            subtitle: None,
            badge: None,
            style: DefinitionCardStyle::default(),
        }
    }

    pub fn subtitle(mut self, subtitle: impl Into<SharedString>) -> Self {
        self.subtitle = Some(subtitle.into());
        self
    }

    pub fn badge(mut self, text: impl Into<SharedString>, color: Rgba) -> Self {
        self.badge = Some((text.into(), color));
        self
    }

    pub fn style(mut self, style: DefinitionCardStyle) -> Self {
        self.style = style;
        self
    }
}

impl RenderOnce for DefinitionCard {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        let style = self.style;
        div()
            .id(self.id)
            .flex()
            .items_center()
            .gap_2()
            .p_2()
            .rounded_md()
            .border_1()
            .border_color(style.border)
            .bg(style.background)
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(div().font_weight(FontWeight::MEDIUM).child(self.title))
                    .when_some(self.subtitle, |el, subtitle| {
                        el.child(
                            div()
                                .text_xs()
                                .text_color(style.secondary_text)
                                .child(subtitle),
                        )
                    }),
            )
            .when_some(self.badge, |el, (text, color)| {
                el.child(
                    div()
                        .rounded_sm()
                        .px_2()
                        .py_1()
                        .text_xs()
                        .bg(color)
                        .child(text),
                )
            })
    }
}
