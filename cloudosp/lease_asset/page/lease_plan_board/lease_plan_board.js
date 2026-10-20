frappe.pages["lease-plan-board"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.plan_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("计划与预定"),
		single_column: true,
	});

	$(`<style>
		.plan-layout { display: flex; gap: 20px; align-items: flex-start; }
		.plan-form-panel { flex: 0 0 480px; }
		.plan-list-panel { flex: 1 1 auto; min-width: 0; }
		.plan-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.plan-title { margin: 0 0 12px; font-weight: 600; }
		.plan-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
		.plan-row label { flex: 0 0 70px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.plan-items th, .plan-items td { font-size: 12px; vertical-align: middle; }
		.plan-order { border: 1px solid var(--border-color); border-radius: var(--border-radius-md); padding: 12px; margin-bottom: 12px; }
		.plan-order-head { display: flex; justify-content: space-between; align-items: center; }
		.plan-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.plan-sum { font-size: 12px; }
		.plan-empty { color: var(--text-muted); font-size: 12px; }
	</style>`).appendTo(page.main);

	const $layout = $(`
		<div class="plan-layout">
			<div class="plan-form-panel plan-panel">
				<h6 class="plan-title">${__("提交计划 / 预订单")}</h6>
				<div class="plan-form">
					<div class="plan-row">
						<label>${__("类型")}</label>
						<select class="form-select form-select-sm" name="plan_type">
							<option value="计划">${__("计划")}</option>
							<option value="预定">${__("预定")}</option>
						</select>
					</div>
					<div class="plan-row">
						<label>${__("客户")}</label>
						<select class="form-select form-select-sm" name="customer"></select>
					</div>
					<div class="plan-row">
						<label>${__("期望日期")}</label>
						<input type="date" class="form-control form-control-sm" name="expected_date">
					</div>
					<div class="plan-row">
						<label>${__("备注")}</label>
						<textarea class="form-control form-control-sm" name="remarks" rows="2"></textarea>
					</div>
					<table class="table table-sm plan-items">
						<thead class="thead-light"><tr>
							<th style="width:40%">${__("产品")}</th>
							<th>${__("区域")}</th>
							<th style="width:80px">${__("数量")}</th>
							<th style="width:90px">${__("月数")}</th>
							<th style="width:40px"></th>
						</tr></thead>
						<tbody></tbody>
					</table>
					<button class="btn btn-sm btn-outline-secondary" id="plan-add-item">${__("添加行")}</button>
					<button class="btn btn-sm btn-primary ml-2" id="plan-save">${__("保存")}</button>
					<div class="plan-msg mt-2"></div>
				</div>
			</div>
			<div class="plan-list-panel plan-panel">
				<div class="d-flex justify-content-between align-items-center">
					<h6 class="plan-title">${__("计划 / 预订单")}</h6>
					<label class="small mb-0">
						<input type="checkbox" id="plan-all" checked> ${__("只看我提交的")}
					</label>
				</div>
				<div class="plan-list"></div>
			</div>
		</div>
	`).appendTo(page.main);

	const $form = $layout.find(".plan-form");
	const $tbody = $layout.find(".plan-items tbody");
	const $list = $layout.find(".plan-list");
	const $msg = $layout.find(".plan-msg");

	const state = { options: null, editing: null };
	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
	};

	const show_msg = (text, type) => {
		$msg.html(text ? `<div class="alert alert-${type || "info"} small mb-0">${text}</div>` : "");
	};

	const product_options = () =>
		(state.options ? state.options.products : [])
			.map(
				(p) =>
					`<option value="${esc(p.name)}">${esc(p.product_name)}${
						p.product_code ? " (" + esc(p.product_code) + ")" : ""
					}</option>`
			)
			.join("");

	const region_options = () =>
		`<option value="">${__("未指定")}</option>` +
		(state.options ? state.options.regions : [])
			.map((r) => `<option value="${esc(r.name)}">${esc(r.region_name)}（${esc(r.name)}）</option>`)
			.join("");

	const add_row = (item) => {
		const row = $(`<tr>
			<td><select class="form-select form-select-sm">${product_options()}</select></td>
			<td><select class="form-select form-select-sm">${region_options()}</select></td>
			<td><input type="number" class="form-control form-control-sm" value="1" min="1" step="any"></td>
			<td><input type="number" class="form-control form-control-sm" value="1" min="1" step="1"></td>
			<td><button class="btn btn-sm btn-outline-danger">&times;</button></td>
		</tr>`);
		if (item) {
			row.find("select").eq(0).val(item.product);
			row.find("select").eq(1).val(item.region || "");
			row.find("input").eq(0).val(item.quantity || 1);
			row.find("input").eq(1).val(item.lease_months || 1);
		}
		row.find("button").on("click", () => {
			if ($tbody.find("tr").length > 1) row.remove();
		});
		$tbody.append(row);
	};

	const collect = (submit) => ({
		name: state.editing || "",
		plan_type: $form.find('[name="plan_type"]').val(),
		customer: $form.find('[name="customer"]').val(),
		expected_date: $form.find('[name="expected_date"]').val(),
		remarks: $form.find('[name="remarks"]').val(),
		submit: submit ? 1 : 0,
		items: $tbody
			.find("tr")
			.map(function () {
				const $row = $(this);
				return {
					product: $row.find("select").eq(0).val(),
					region: $row.find("select").eq(1).val() || "",
					quantity: $row.find("input").eq(0).val(),
					lease_months: $row.find("input").eq(1).val(),
				};
			})
			.get(),
	});

	const reset_form = () => {
		state.editing = null;
		$form.find('[name="plan_type"]').val("计划");
		$form.find('[name="customer"]').val("");
		$form.find('[name="expected_date"]').val("");
		$form.find('[name="remarks"]').val("");
		$tbody.empty();
		add_row();
		show_msg("");
	};

	const render_list = (orders) => {
		if (!orders.length) {
			$list.html(`<div class="plan-empty">${__("暂无计划 / 预订单")}</div>`);
			return;
		}

		let html = "";
		orders.forEach((order) => {
			let rows = "";
			(order.summary || []).forEach((s) => {
				rows += `<tr>
					<td>${esc(s.region_name || s.region || __("未指定区域"))}</td>
					<td class="text-right">${esc(num(s.cpu_total))}</td>
					<td class="text-right">${esc(num(s.memory_total))}</td>
					<td class="text-right">${esc(num(s.storage_total))}</td>
				</tr>`;
			});

			html += `<div class="plan-order" data-name="${esc(order.name)}">
				<div class="plan-order-head">
					<div>
						<b>${esc(order.name)}</b>
						<span class="badge badge-secondary">${esc(order.plan_type)}</span>
						<span class="plan-tag">${esc(order.status)}</span>
						<span class="plan-tag">${esc(order.customer_name || order.customer || __("未指定客户"))}</span>
						<span class="plan-tag">${esc(order.requested_by || "")}</span>
						<span class="plan-tag">${esc(order.expected_date || "")}</span>
					</div>
					<div>
						<button class="btn btn-xs btn-default plan-edit">${__("编辑")}</button>
						<button class="btn btn-xs btn-danger plan-del">${__("删除")}</button>
					</div>
				</div>
				<table class="table table-sm table-bordered mt-2 mb-0 plan-sum">
					<thead class="thead-light"><tr>
						<th>${__("区域")}</th>
						<th class="text-right">${__("CPU（核）")}</th>
						<th class="text-right">${__("内存（GB）")}</th>
						<th class="text-right">${__("存储（TB）")}</th>
					</tr></thead>
					<tbody>${rows || `<tr><td colspan="4" class="plan-empty">${__("无明细")}</td></tr>`}</tbody>
					<tfoot><tr>
						<th>${__("合计")}</th>
						<th class="text-right">${esc(num(order.cpu_total))}</th>
						<th class="text-right">${esc(num(order.memory_total))}</th>
						<th class="text-right">${esc(num(order.storage_total))}</th>
					</tr></tfoot>
				</table>
			</div>`;
		});
		$list.html(html);
	};

	const load_orders = () => {
		const only_mine = $layout.find("#plan-all").is(":checked");
		api("get_plan_orders", { only_mine: only_mine ? 1 : 0 })
			.then(render_list)
			.catch((err) => $list.html(`<div class="plan-empty">${esc(err || __("加载失败"))}</div>`));
	};

	const load_options = () => {
		api("get_plan_options").then((res) => {
			state.options = res;
			$form
				.find('[name="customer"]')
				.html(
					`<option value="">${__("未指定")}</option>` +
						(res.customers || []).map((c) => `<option value="${esc(c.name)}">${esc(c.customer_name)}</option>`).join("")
				);
			$tbody.find("tr").remove();
			add_row();
		});
	};

	$layout.find("#plan-add-item").on("click", () => add_row());

	$layout.find("#plan-save").on("click", () => {
		show_msg("");
		api("save_plan_order", collect(false))
			.then((res) => {
				show_msg(`${__("已保存")}：${esc(res.name)}`, "success");
				reset_form();
				load_orders();
			})
			.catch((err) => show_msg(esc(err || __("保存失败")), "danger"));
	});

	$layout.find("#plan-all").on("change", load_orders);

	$layout.find(".plan-list").on("click", ".plan-del", function () {
		const name = $(this).closest(".plan-order").attr("data-name");
		if (!confirm(__("确认删除该计划 / 预订单？"))) return;
		api("delete_plan_order", { name: name })
			.then(load_orders)
			.catch((err) => show_msg(esc(err || __("删除失败")), "danger"));
	});

	$layout.find(".plan-list").on("click", ".plan-edit", function () {
		const name = $(this).closest(".plan-order").attr("data-name");
		frappe.db.get_doc("Lease Plan Order", name).then((doc) => {
			state.editing = doc.name;
			$form.find('[name="plan_type"]').val(doc.plan_type);
			$form.find('[name="customer"]').val(doc.customer || "");
			$form.find('[name="expected_date"]').val(doc.expected_date || "");
			$form.find('[name="remarks"]').val(doc.remarks || "");
			$tbody.empty();
			(doc.items || []).forEach((item) => add_row(item));
			show_msg(__("已载入") + " " + doc.name);
		});
	});

	page.set_primary_action(__("新建"), reset_form);
	page.set_secondary_action(__("刷新"), () => {
		load_options();
		load_orders();
	});

	load_options();
	load_orders();
};
