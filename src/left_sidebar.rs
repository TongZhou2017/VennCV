//! 左侧「领域 + 项目」数据表（egui_extras Strip 列布局）

use crate::app::{Theme, VennCVApp};
use crate::models::*;
use egui::*;
use egui_extras::{Size as StripSize, StripBuilder};
use std::collections::HashMap;

pub(crate) fn show_left_project_table(app: &mut VennCVApp, ctx: &Context, theme: &Theme) {
    if !app.show_project_table {
        return;
    }

    SidePanel::left("project_table")
        .resizable(true)
        .default_width(200.0)
        .width_range(150.0..=400.0)
        .frame(
            Frame::side_top_panel(&ctx.style())
                .fill(theme.surface)
                .stroke(Stroke::new(1.0, theme.divider)),
        )
        .show(ctx, |ui| {
            ui.set_max_width(ui.available_width());

            let field_height = app.field_section_height.clamp(20.0, 200.0);
            let field_block_w = ui.available_width();
            ui.allocate_ui_with_layout(
                vec2(field_block_w, field_height),
                Layout::top_down(Align::LEFT),
                |ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("领域")
                                .size(11.0)
                                .color(theme.text_secondary),
                        );
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui.small_button("+").clicked() {
                                let new_id = VennCVApp::alloc_new_field_id(&app.data.fields);
                                let new_field = ResearchField {
                                    id: new_id.clone(),
                                    name: "新领域".to_string(),
                                    description: String::new(),
                                    position: (400.0, 400.0),
                                    radius: 200.0,
                                };
                                app.data.fields.insert(new_id, new_field);
                                app.save_to_history();
                            }
                        });
                    });
                    ui.add_space(4.0);

                    let field_ids_left: Vec<String> = app.data.fields.keys().cloned().collect();
                    let mut fields_to_remove_left: Vec<String> = Vec::new();
                    let mut fields_to_update_left: HashMap<String, String> = HashMap::new();
                    let mut field_reorder: Option<(usize, usize)> = None;

                    ScrollArea::vertical()
                        .auto_shrink([false; 2])
                        .show(ui, |ui| {
                            for (idx, field_id) in field_ids_left.iter().enumerate() {
                                if let Some(field) = app.data.fields.get(field_id) {
                                    let item_height = 24.0;
                                    let row_w = ui.available_width();
                                    let item_rect =
                                        Rect::from_min_size(ui.cursor().min, vec2(row_w, item_height));

                                    if let Some(target_idx) = app.field_drag_target_idx {
                                        if target_idx == idx {
                                            ui.painter().rect_filled(
                                                Rect::from_min_size(
                                                    pos2(item_rect.min.x, item_rect.min.y - 1.0),
                                                    vec2(item_rect.width(), 2.0),
                                                ),
                                                0.0,
                                                Color32::from_rgb(0, 122, 204),
                                            );
                                        }
                                    }

                                    if app.dragging_field_idx == Some(idx) {
                                        ui.painter().rect_filled(
                                            item_rect,
                                            Rounding::same(2.0),
                                            theme.selection,
                                        );
                                    }

                                    let row_response = StripBuilder::new(ui)
                                        .cell_layout(Layout::left_to_right(Align::Center))
                                        .size(StripSize::exact(16.0))
                                        .size(StripSize::exact(28.0))
                                        .size(StripSize::remainder().at_least(32.0))
                                        .size(StripSize::exact(26.0))
                                        .horizontal(|mut strip| {
                                            strip.cell(|ui| {
                                                let grip = ui
                                                    .add_sized(
                                                        [16.0, item_height],
                                                        Button::new(
                                                            RichText::new("⋮")
                                                                .size(11.0)
                                                                .color(theme.text_secondary),
                                                        )
                                                        .frame(false)
                                                        .sense(Sense::drag()),
                                                    )
                                                    .on_hover_text("按住拖动以调整领域顺序");
                                                if grip.drag_started() {
                                                    app.dragging_field_idx = Some(idx);
                                                }
                                                if grip.dragged() && app.dragging_field_idx.is_some() {
                                                    ctx.set_cursor_icon(CursorIcon::Grabbing);
                                                }
                                                if grip.drag_stopped() {
                                                    if let (Some(from_idx), Some(to_idx)) =
                                                        (app.dragging_field_idx, app.field_drag_target_idx)
                                                    {
                                                        if from_idx != to_idx && from_idx + 1 != to_idx {
                                                            field_reorder = Some((from_idx, to_idx));
                                                        }
                                                    }
                                                    app.dragging_field_idx = None;
                                                    app.field_drag_target_idx = None;
                                                }
                                            });
                                            strip.cell(|ui| {
                                                ui.add_sized(
                                                    [28.0, item_height],
                                                    Label::new(
                                                        RichText::new(format!("{:>2}.", idx + 1))
                                                            .size(11.0)
                                                            .color(theme.text_secondary)
                                                            .monospace(),
                                                    ),
                                                );
                                            });
                                            strip.cell(|ui| {
                                                let mut field_name = field.name.clone();
                                                let input_w = ui.available_width().max(32.0);
                                                let name_response = ui.add(
                                                    TextEdit::singleline(&mut field_name)
                                                        .desired_width(input_w)
                                                        .clip_text(true)
                                                        .id(Id::new("venncv_field_name").with(field_id.as_str())),
                                                );
                                                if name_response.changed() {
                                                    fields_to_update_left
                                                        .insert(field_id.clone(), field_name);
                                                }
                                            });
                                            strip.cell(|ui| {
                                                let del = ui
                                                    .add_sized(
                                                        [26.0, item_height],
                                                        Button::new(
                                                            RichText::new("×")
                                                                .size(14.0)
                                                                .color(theme.text_secondary),
                                                        )
                                                        .small(),
                                                    );
                                                if del.clicked() {
                                                    fields_to_remove_left.push(field_id.clone());
                                                }
                                            });
                                        });

                                    let strip_rect = row_response.rect;
                                    if app.dragging_field_idx.is_some() {
                                        if let Some(pointer_pos) = ui.input(|i| i.pointer.hover_pos()) {
                                            if strip_rect.contains(pointer_pos) {
                                                let relative_y = pointer_pos.y - strip_rect.min.y;
                                                if relative_y < item_height / 2.0 {
                                                    app.field_drag_target_idx = Some(idx);
                                                } else {
                                                    app.field_drag_target_idx = Some(idx + 1);
                                                }
                                            }
                                        }
                                    }

                                    ui.add_space(2.0);
                                }
                            }

                            if let Some(target_idx) = app.field_drag_target_idx {
                                if target_idx == field_ids_left.len() {
                                    let rect = ui.available_rect_before_wrap();
                                    ui.painter().rect_filled(
                                        Rect::from_min_size(
                                            pos2(rect.min.x, rect.min.y - 1.0),
                                            vec2(rect.width(), 2.0),
                                        ),
                                        0.0,
                                        Color32::from_rgb(0, 122, 204),
                                    );
                                }
                            }
                        });

                    if let Some((from_idx, to_idx)) = field_reorder {
                        let entries: Vec<_> = app.data.fields.drain(..).collect();
                        let mut new_entries = Vec::with_capacity(entries.len());
                        let actual_to = if to_idx > from_idx { to_idx - 1 } else { to_idx };
                        for (i, entry) in entries.iter().enumerate() {
                            if i == from_idx {
                                continue;
                            }
                            if i == actual_to && to_idx <= from_idx {
                                new_entries.push(entries[from_idx].clone());
                            }
                            new_entries.push(entry.clone());
                            if i == actual_to && to_idx > from_idx {
                                new_entries.push(entries[from_idx].clone());
                            }
                        }
                        if actual_to >= entries.len() - 1 && to_idx > from_idx {
                            new_entries.push(entries[from_idx].clone());
                        }
                        if new_entries.len() < entries.len() {
                            new_entries.push(entries[from_idx].clone());
                        }
                        for (k, v) in new_entries {
                            app.data.fields.insert(k, v);
                        }
                        app.adjust_field_layout();
                        app.recalculate_all_project_positions_with_jitter();
                        app.validate_and_fix_project_positions();
                        app.save_to_history();
                    }

                    if !fields_to_update_left.is_empty() {
                        for (fid, new_name) in fields_to_update_left {
                            if let Some(f) = app.data.fields.get_mut(&fid) {
                                f.name = new_name;
                            }
                        }
                        app.save_to_history();
                    }

                    if !fields_to_remove_left.is_empty() {
                        for fid in fields_to_remove_left {
                            for project in app.data.projects.values_mut() {
                                project.field_ids.retain(|id| id != &fid);
                            }
                            app.data.fields.shift_remove(&fid);
                        }
                        app.save_to_history();
                    }
                },
            );

            let separator_rect = ui.available_rect_before_wrap();
            let separator_rect =
                Rect::from_min_size(separator_rect.min, vec2(separator_rect.width(), 8.0));
            let separator_response = ui.allocate_rect(separator_rect, Sense::drag());
            let separator_color = if separator_response.hovered() || separator_response.dragged() {
                Color32::from_rgb(100, 150, 255)
            } else {
                theme.divider
            };
            ui.painter().rect_filled(
                Rect::from_min_size(
                    pos2(separator_rect.min.x, separator_rect.center().y - 1.0),
                    vec2(separator_rect.width(), 2.0),
                ),
                0.0,
                separator_color,
            );
            if separator_response.dragged() {
                app.field_section_height += separator_response.drag_delta().y;
                app.field_section_height = app.field_section_height.clamp(20.0, 200.0);
            }
            if separator_response.hovered() || separator_response.dragged() {
                ctx.set_cursor_icon(CursorIcon::ResizeVertical);
            }

            ui.add_space(4.0);

            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("项目")
                        .size(11.0)
                        .color(theme.text_secondary),
                );
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.small_button("+").clicked() {
                        app.create_new_project_shortcut();
                    }
                });
            });
            ui.add_space(4.0);
            ui.separator();
            ui.add_space(4.0);

            ScrollArea::vertical()
                .auto_shrink([false; 2])
                .show(ui, |ui| {
                    for (idx, (id, project)) in app.data.projects.iter().enumerate() {
                        let is_selected = app.selected_project.as_ref() == Some(id);
                        let row_h = 24.0;

                        StripBuilder::new(ui)
                            .cell_layout(Layout::left_to_right(Align::Center))
                            .size(StripSize::remainder().at_least(48.0))
                            .size(StripSize::exact(76.0))
                            .horizontal(|mut strip| {
                                strip.cell(|ui| {
                                    let w = ui.available_width().max(48.0);
                                    let label = format!("{:2}. {}", idx + 1, project.name);
                                    let row = ui.add_sized(
                                        [w, row_h],
                                        egui::SelectableLabel::new(
                                            is_selected,
                                            RichText::new(label).size(13.0),
                                        ),
                                    );
                                    if row.clicked() {
                                        app.selected_project = Some(id.clone());
                                        app.editing_project = Some(project.clone());
                                        app.project_edit_buffer = Some(project.clone());
                                    }
                                });
                                strip.cell(|ui| {
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        let status_color = project.status.color();
                                        ui.label(
                                            RichText::new(project.status.name())
                                                .size(10.0)
                                                .color(Color32::WHITE)
                                                .background_color(status_color),
                                        );
                                    });
                                });
                            });

                        ui.add_space(2.0);
                    }
                });
        });
}
