use gpui::prelude::*;
use gpui::{px, Context, Entity, SharedString, Subscription, Window};
use gpui_component::input::{Input, InputEvent, InputState};

const SINGLE_LINE_HEIGHT: f32 = 36.0;
const MULTI_LINE_HEIGHT: f32 = 160.0;

/// Convenience helper for creating a single-line [`FormTextInput`].
pub fn create_form_text_input<T>(
    cx: &mut Context<T>,
    placeholder: impl Into<SharedString>,
    initial: impl Into<SharedString>,
) -> Entity<FormTextInput>
where
    T: 'static,
{
    create_form_text_input_with_mode(cx, placeholder.into(), initial.into(), false)
}

/// Convenience helper for creating a multi-line [`FormTextInput`].
pub fn create_multiline_form_text_input<T>(
    cx: &mut Context<T>,
    placeholder: impl Into<SharedString>,
    initial: impl Into<SharedString>,
) -> Entity<FormTextInput>
where
    T: 'static,
{
    create_form_text_input_with_mode(cx, placeholder.into(), initial.into(), true)
}

fn create_form_text_input_with_mode<T>(
    cx: &mut Context<T>,
    placeholder: SharedString,
    initial: SharedString,
    multi_line: bool,
) -> Entity<FormTextInput>
where
    T: 'static,
{
    cx.new(move |cx| FormTextInput::new(cx, placeholder.clone(), initial.clone(), multi_line))
}

pub struct FormTextInput {
    placeholder: SharedString,
    value: SharedString,
    multi_line: bool,
    pending_value_sync: bool,
    input_state: Option<Entity<InputState>>,
    _subscriptions: Vec<Subscription>,
}

impl FormTextInput {
    fn new(
        _cx: &mut Context<Self>,
        placeholder: SharedString,
        initial: SharedString,
        multi_line: bool,
    ) -> Self {
        Self {
            placeholder,
            value: initial,
            multi_line,
            pending_value_sync: false,
            input_state: None,
            _subscriptions: Vec::new(),
        }
    }

    pub fn text(&self) -> String {
        self.value.to_string()
    }

    pub fn set_text(&mut self, value: impl Into<SharedString>, cx: &mut Context<Self>) {
        let new_value = value.into();
        if self.value != new_value {
            self.value = new_value;
            self.pending_value_sync = true;
            cx.notify();
        }
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.set_text("", cx);
    }

    fn ensure_input_state(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<InputState> {
        if let Some(state) = &self.input_state {
            return state.clone();
        }

        let placeholder = self.placeholder.clone();
        let value = self.value.clone();
        let multi_line = self.multi_line;

        let state = cx.new(|cx| {
            let mut state = InputState::new(window, cx)
                .placeholder(placeholder.clone())
                .default_value(value.clone());
            if multi_line {
                state = state.multi_line(true);
            }
            state
        });

        let subscription = cx.subscribe(&state, |this, entity, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                let new_value = entity.read(cx).value();
                if this.value != new_value {
                    this.value = new_value;
                }
            }
        });

        self._subscriptions.push(subscription);
        self.input_state = Some(state.clone());
        state
    }

    fn sync_pending_value(
        &mut self,
        state: &Entity<InputState>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.pending_value_sync {
            return;
        }

        let updated = self.value.clone();
        state.update(cx, |input, cx| {
            input.set_value(updated.clone(), window, cx);
        });
        self.pending_value_sync = false;
    }
}

impl Render for FormTextInput {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.ensure_input_state(window, cx);
        self.sync_pending_value(&state, window, cx);

        Input::new(&state)
            .w_full()
            .when(self.multi_line, |input| input.h(px(MULTI_LINE_HEIGHT)))
            .when(!self.multi_line, |input| input.h(px(SINGLE_LINE_HEIGHT)))
    }
}
