frappe.pages["lease-request-process"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.request_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("租赁申请处理"),
		single_column: true,
	});

	$(`<style>
		.rq-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.rq-steps { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
		.rq-step { padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 999px; font-size: 12px; }
		.rq-step.active { background: var(--blue-500); color: #fff; border-color: var(--blue-500); }
		.rq-step.done { background: var(--control-bg); }
		.rq-title { margin: 0 0 10px; font-weight: 600; }
		.rq-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
		.rq-row label { flex: 0 0 110px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.rq-actions { display: flex; gap: 8px; margin-top: 12px; }
		.rq-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.rq-list th, .rq-list td { font-size: 12px; vertical-align: middle; }
		.rq-empty { color: var(--text-muted); font-size: 12px; }
	</style>`).appendTo(page.main);

	const $panel = $(`<div class="rq-panel">
		<div class="rq-mode mb-3"></div>
		<div class="rq-steps"></div>
		<div class="rq-body"></div>
	</div>`).appendTo(page.main);

	const $steps = $panel.find(".rq-steps");
	const $body = $panel.find(".rq-body");

	const STEPS = [
		{ key: "order", title: __("关联订单") },
		{ key: "products", title: __("选择产品") },
		{ key: "delivery", title: __("交付信息") },
		{ key: "tags", title: __("运营标签") },
		{ key: "capacity", title: __("容量扣减 / 资源池读数") },
		{ key: "notify", title: __("通知方式") },
		{ key: "finish", title: __("结束") },
	];

	const state = {
		mode: "process",
		step: 0,
		options: null,
		payload: { lease_order: "", products: [], delivery_items: [], tags: [], readings: [], notify_elink_bot: 0, notify_sms: 0 },
		app: { name: "", customer: "", resource_pool: "", items: [], delivery_ip: "", login_account: "", login_password: "", tenant_user: "" },
	};

	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
	};

	const render_steps = () => {
		$steps.html(
			STEPS.map(
				(step, idx) =>
					`<span class="rq-step ${idx === state.step ? "active" : ""} ${idx < state.step ? "done" : ""}">
						${esc(idx + 1)}. ${esc(step.title)}</span>`
			).join("")
		);
	};

	const nav = (with_prev = true) =>
		`<div class="rq-actions">
			${with_prev ? `<button class="btn btn-sm btn-default rq-prev">${__("上一步")}</button>` : ""}
			<button class="btn btn-sm btn-primary rq-next">${__("下一步")}</button>
		</div>`;

	const render_order = () => {
		const orders = state.options ? state.options.orders : [];
		$body.html(`
			<h6 class="rq-title">${__("关联租赁订单")}</h6>
			<div class="rq-row">
				<label>${__("租赁订单")}</label>
				<select class="form-select form-select-sm rq-order" style="max-width:360px">
					<option value="">${__("请选择订单")}</option>
					${orders
						.map(
							(o) =>
								`<option value="${esc(o.name)}">${esc(o.name)} · ${esc(o.customer_name || o.customer || "")} · ${esc(o.status)}</option>`
						)
						.join("")}
				</select>
			</div>
			<div class="rq-order-info mt-2"></div>
			<div class="rq-actions">
				<button class="btn btn-sm btn-primary rq-next">${__("下一步")}</button>
			</div>
			<div class="rq-msg mt-2"></div>
		`);
		$body.find(".rq-order").val(state.payload.lease_order || "");
		$body.find(".rq-order").on("change", show_order_info);
		show_order_info();
	};

	const show_order_info = () => {
		const name = $body.find(".rq-order").val();
		const order = (state.options.orders || []).find((o) => o.name === name);
		if (!order) {
			$body.find(".rq-order-info").html("");
			return;
		}
		$body.find(".rq-order-info").html(`
			<table class="table table-sm table-bordered rq-list" style="max-width:560px">
				<thead class="thead-light"><tr><th>${__("产品")}</th><th class="text-right">${__("数量")}</th><th class="text-right">${__("月数")}</th></tr></thead>
				<tbody>
					${(order.items || [])
						.map(
							(i) =>
								`<tr><td>${esc(i.product_name || i.product)}</td><td class="text-right">${esc(
									num(i.quantity)
								)}</td><td class="text-right">${esc(i.lease_months)}</td></tr>`
						)
						.join("")}
				</tbody>
			</table>
		`);
	};

	const render_products = () => {
		const products = state.options ? state.options.products : [];
		const selected = state.payload.products || [];
		$body.html(`
			<h6 class="rq-title">${__("选择产品列表")}</h6>
			<table class="table table-sm table-bordered rq-list">
				<thead class="thead-light"><tr>
					<th style="width:40px"></th><th>${__("产品")}</th><th>${__("类别")}</th>
					<th class="text-right">${__("数量")}</th><th>${__("规格")}</th>
				</tr></thead>
				<tbody>
					${products
						.map((p) => {
							const chosen = selected.find((s) => s.product === p.name);
							return `<tr>
								<td><input type="checkbox" class="rq-product" data-name="${esc(p.name)}"
									${chosen ? "checked" : ""}></td>
								<td>${esc(p.product_name)}<span class="rq-tag">${esc(p.product_code || p.name)}</span></td>
								<td>${esc(p.category || "")}</td>
								<td><input type="number" class="form-control form-control-sm rq-qty"
									data-name="${esc(p.name)}" value="${esc(chosen ? chosen.quantity : 1)}" min="1" step="any"></td>
								<td>${(p.specs || [])
									.map((s) => `${esc(s.spec_name)} ${esc(num(s.planned_value))}${esc(s.unit || "")}`)
									.join(" / ")}</td>
							</tr>`;
						})
						.join("")}
				</tbody>
			</table>
			${nav()}
			<div class="rq-msg mt-2"></div>
		`);
	};

	const render_delivery = () => {
		$body.html(`<div class="rq-empty">${__("生成中")}...</div>`);
		const products = collect_products();
		api("get_delivery_template", { products: products }).then((rows) => {
			state.payload.delivery_items = rows;
			if (!rows.length) {
				$body.html(`
					<h6 class="rq-title">${__("交付信息")}</h6>
					<div class="rq-empty">${__("所选产品没有定义规格")}</div>
					${nav()}
				`);
				return;
			}

			$body.html(`
				<h6 class="rq-title">${__("交付信息（由产品规格定义，请录入实际交付值）")}</h6>
				<table class="table table-sm table-bordered rq-list">
					<thead class="thead-light"><tr>
						<th>${__("产品")}</th><th>${__("规格项")}</th><th>${__("维度")}</th>
						<th class="text-right">${__("应交付")}</th><th class="text-right">${__("实际交付")}</th>
					</tr></thead>
					<tbody>
						${rows
							.map(
								(r) => `<tr>
									<td>${esc(r.product_name)}</td>
									<td>${esc(r.spec_name)}<span class="rq-tag">${esc(r.unit || "")}</span></td>
									<td>${esc(r.dimension || "")}</td>
									<td class="text-right">${esc(num(r.planned_value))}</td>
									<td><input type="number" class="form-control form-control-sm rq-delivered"
										data-spec="${esc(r.spec || "")}" value="${esc(r.delivered_value)}" step="any"></td>
								</tr>`
							)
							.join("")}
					</tbody>
				</table>
				${nav()}
			`);
		});
	};

	const render_tags = () => {
		const tags = state.payload.tags.length ? state.payload.tags : [{ tag_key: "", tag_value: "" }];
		$body.html(`
			<h6 class="rq-title">${__("录入运营标签")}</h6>
			<table class="table table-sm rq-list">
				<thead class="thead-light"><tr>
					<th style="width:34%">${__("标签名")}</th><th>${__("标签值")}</th><th style="width:40px"></th>
				</tr></thead>
				<tbody>
					${tags
						.map(
							(t) => `<tr>
								<td><input class="form-control form-control-sm rq-tag-key" value="${esc(t.tag_key)}"></td>
								<td><input class="form-control form-control-sm rq-tag-value" value="${esc(t.tag_value)}"></td>
								<td><button class="btn btn-sm btn-outline-danger rq-tag-del">&times;</button></td>
							</tr>`
						)
						.join("")}
				</tbody>
			</table>
			<button class="btn btn-sm btn-outline-secondary rq-tag-add">${__("添加标签")}</button>
			${nav()}
		`);

		$body.find(".rq-tag-add").on("click", () => {
			$body.find(".rq-list tbody").append(`
				<tr>
					<td><input class="form-control form-control-sm rq-tag-key"></td>
					<td><input class="form-control form-control-sm rq-tag-value"></td>
					<td><button class="btn btn-sm btn-outline-danger rq-tag-del">&times;</button></td>
				</tr>
			`);
		});
		$body.on("click", ".rq-tag-del", function () {
			if ($body.find(".rq-list tbody tr").length > 1) $(this).closest("tr").remove();
		});
	};

	const render_capacity = () => {
		const pools = state.options ? state.options.pools : [];
		const readings = state.payload.readings.length
			? state.payload.readings
			: [{ resource_pool: "", cpu_used: 0, memory_used: 0, storage_used: 0, status: "可用" }];

		$body.html(`
			<h6 class="rq-title">${__("容量扣减信息与资源池状态读数")}</h6>
			<div class="rq-row">
				<label>${__("扣减 CPU（核）")}</label>
				<input type="number" class="form-control form-control-sm rq-cpu-deduct" value="${esc(
					state.payload.cpu_deduct || 0
				)}" style="max-width:140px">
				<label style="flex:0 0 auto">${__("内存（GB）")}</label>
				<input type="number" class="form-control form-control-sm rq-mem-deduct" value="${esc(
					state.payload.memory_deduct || 0
				)}" style="max-width:140px">
				<label style="flex:0 0 auto">${__("存储（TB）")}</label>
				<input type="number" class="form-control form-control-sm rq-sto-deduct" value="${esc(
					state.payload.storage_deduct || 0
				)}" style="max-width:140px">
			</div>
			<table class="table table-sm table-bordered rq-list rq-readings">
				<thead class="thead-light"><tr>
					<th>${__("资源池")}</th><th class="text-right">${__("CPU 读数（核）")}</th>
					<th class="text-right">${__("内存读数（GB）")}</th><th class="text-right">${__("存储读数（TB）")}</th>
					<th>${__("状态")}</th><th style="width:40px"></th>
				</tr></thead>
				<tbody>
					${readings
						.map(
							(r) => `<tr>
								<td><select class="form-select form-select-sm rq-pool">
									<option value="">${__("请选择资源池")}</option>
									${pools
										.map(
											(p) =>
												`<option value="${esc(p.name)}">${esc(p.pool_name)}
													<span class="rq-tag">CPU ${esc(num(p.cpu_used))}/${esc(
													num(p.cpu_total)
												)}</span></option>`
										)
										.join("")}
								</select></td>
								<td><input type="number" class="form-control form-control-sm rq-cpu-used" value="${esc(
									r.cpu_used || 0
								)}" step="any"></td>
								<td><input type="number" class="form-control form-control-sm rq-mem-used" value="${esc(
									r.memory_used || 0
								)}" step="any"></td>
								<td><input type="number" class="form-control form-control-sm rq-sto-used" value="${esc(
									r.storage_used || 0
								)}" step="any"></td>
								<td><select class="form-select form-select-sm rq-pool-status">
									<option value="可用">${__("可用")}</option>
									<option value="已满">${__("已满")}</option>
									<option value="维护中">${__("维护中")}</option>
								</select></td>
								<td><button class="btn btn-sm btn-outline-danger rq-reading-del">&times;</button></td>
							</tr>`
						)
						.join("")}
				</tbody>
			</table>
			<button class="btn btn-sm btn-outline-secondary rq-reading-add">${__("添加读数")}</button>
			${nav()}
			<div class="rq-msg mt-2"></div>
		`);

		readings.forEach((r, idx) => {
			$body.find(".rq-pool").eq(idx).val(r.resource_pool || "");
			$body.find(".rq-pool-status").eq(idx).val(r.status || "可用");
		});

		$body.find(".rq-reading-add").on("click", () => {
			const row = $body.find(".rq-readings tbody tr").first().clone();
			row.find("input").val(0);
			row.find("select").val("");
			$body.find(".rq-readings tbody").append(row);
		});
		$body.on("click", ".rq-reading-del", function () {
			if ($body.find(".rq-readings tbody tr").length > 1) $(this).closest("tr").remove();
		});
	};

	const render_notify = () => {
		$body.html(`
			<h6 class="rq-title">${__("通知申请方的方式")}</h6>
			<div class="rq-row">
				<label class="d-flex align-items-center" style="flex:0 0 auto">
					<input type="checkbox" class="rq-elink" ${state.payload.notify_elink_bot ? "checked" : ""}>
					<span class="ml-1">eLink Bot 推送</span>
				</label>
				<label class="d-flex align-items-center" style="flex:0 0 auto">
					<input type="checkbox" class="rq-sms" ${state.payload.notify_sms ? "checked" : ""}>
					<span class="ml-1">${__("短信推送")}</span>
				</label>
			</div>
			${nav()}
		`);
	};

	const render_finish = () => {
		const p = state.payload;
		$body.html(`
			<h6 class="rq-title">${__("结束")}</h6>
			<table class="table table-sm table-bordered rq-list" style="max-width:560px">
				<tbody>
					<tr><th>${__("关联订单")}</th><td>${esc(p.lease_order)}</td></tr>
					<tr><th>${__("产品")}</th><td>${esc((p.products || []).map((r) => r.product).join("、") || "-")}</td></tr>
					<tr><th>${__("交付信息条数")}</th><td>${esc((p.delivery_items || []).length)}</td></tr>
					<tr><th>${__("运营标签")}</th><td>${esc(
						(p.tags || []).map((t) => `${t.tag_key}:${t.tag_value || ""}`).join("、") || "-"
					)}</td></tr>
					<tr><th>${__("容量扣减")}</th><td>CPU ${esc(num(p.cpu_deduct))}${esc(__("核"))} / ${__("内存")} ${esc(
			num(p.memory_deduct)
		)}GB / ${__("存储")} ${esc(num(p.storage_deduct))}TB</td></tr>
					<tr><th>${__("资源池读数")}</th><td>${esc((p.readings || []).length)} ${__("条")}</td></tr>
					<tr><th>${__("通知方式")}</th><td>${[
						p.notify_elink_bot ? "eLink Bot" : "",
						p.notify_sms ? __("短信") : "",
					]
						.filter(Boolean)
						.join("、") || "-"}</td></tr>
				</tbody>
			</table>
			<div class="rq-actions">
				<button class="btn btn-sm btn-default rq-prev">${__("上一步")}</button>
				<button class="btn btn-sm btn-primary rq-finish">${__("完成处理")}</button>
			</div>
			<div class="rq-msg mt-2"></div>
		`);
	};

	const collect_products = () => {
		const rows = [];
		$body.find(".rq-product:checked").each(function () {
			const name = $(this).attr("data-name");
			const qty = $body.find(`.rq-qty[data-name="${name}"]`).val();
			rows.push({ product: name, quantity: qty || 1 });
		});
		state.payload.products = rows;
		return rows;
	};

	const render_step = () => {
		const step = STEPS[state.step];
		if (step.key === "order") render_order();
		else if (step.key === "products") render_products();
		else if (step.key === "delivery") render_delivery();
		else if (step.key === "tags") render_tags();
		else if (step.key === "capacity") render_capacity();
		else if (step.key === "notify") render_notify();
		else render_finish();
	};

	$body.on("click", ".rq-prev", () => {
		state.step = Math.max(state.step - 1, 0);
		render_steps();
		render_step();
	});

	$body.on("click", ".rq-next", () => {
		const $msg = $body.find(".rq-msg");
		const step = STEPS[state.step];

		if (step.key === "order") {
			const order = $body.find(".rq-order").val();
			if (!order) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请选择关联订单")}</div>`);
				return;
			}
			state.payload.lease_order = order;
		}

		if (step.key === "products") {
			const products = collect_products();
			if (!products.length) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请至少选择一个产品")}</div>`);
				return;
			}
		}

		if (step.key === "delivery") {
			const rows = state.payload.delivery_items || [];
			$body.find(".rq-delivered").each(function (idx) {
				if (rows[idx]) rows[idx].delivered_value = $(this).val();
			});
			state.payload.delivery_items = rows;
		}

		if (step.key === "tags") {
			const tags = [];
			$body.find(".rq-list tbody tr").each(function () {
				const key = $(this).find(".rq-tag-key").val();
				if (!key) return;
				tags.push({ tag_key: key, tag_value: $(this).find(".rq-tag-value").val() });
			});
			state.payload.tags = tags;
		}

		if (step.key === "capacity") {
			state.payload.cpu_deduct = $body.find(".rq-cpu-deduct").val();
			state.payload.memory_deduct = $body.find(".rq-mem-deduct").val();
			state.payload.storage_deduct = $body.find(".rq-sto-deduct").val();
			const readings = [];
			$body.find(".rq-readings tbody tr").each(function () {
				const $row = $(this);
				const pool = $row.find(".rq-pool").val();
				if (!pool) return;
				readings.push({
					resource_pool: pool,
					cpu_used: $row.find(".rq-cpu-used").val(),
					memory_used: $row.find(".rq-mem-used").val(),
					storage_used: $row.find(".rq-sto-used").val(),
					status: $row.find(".rq-pool-status").val(),
				});
			});
			state.payload.readings = readings;
		}

		if (step.key === "notify") {
			state.payload.notify_elink_bot = $body.find(".rq-elink").is(":checked") ? 1 : 0;
			state.payload.notify_sms = $body.find(".rq-sms").is(":checked") ? 1 : 0;
		}

		state.step = Math.min(state.step + 1, STEPS.length - 1);
		render_steps();
		render_step();
	});

	$body.on("click", ".rq-finish", function () {
		const $msg = $body.find(".rq-msg");
		$msg.html("");
		api("save_request", { values: state.payload, complete: 1 })
			.then((res) => {
				const result = res.result || {};
				$msg.html(
					`<div class="alert alert-success small mb-0">${__("处理完成")}：${esc(res.name)}<br>
					${__("产品")} ${esc(res.product_count)} / ${__("交付信息")} ${esc(res.delivery_count)} / ${__("标签")} ${esc(
						res.tag_count
					)} / ${__("读数")} ${esc(res.reading_count)}<br>
					${__("已更新资源池")}：${esc((result.pools_updated || []).join("、") || "-")}</div>`
				);
			})
			.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err || __("保存失败"))}</div>`));
	});

	const load = () =>
		api("get_request_options").then((res) => {
			state.options = res;
		});

	// ------------------------------------------------ 申请单直录模式
	const render_mode = () => {
		$panel.find(".rq-mode").html(`
			<h6 class="rq-title">${__("选择处理方式")}</h6>
			<button class="btn btn-sm ${state.mode === "process" ? "btn-primary" : "btn-default"} rq-mode-btn" data-mode="process">${__(
			"申请处理流程"
		)}</button>
			<button class="btn btn-sm ${state.mode === "direct" ? "btn-primary" : "btn-default"} rq-mode-btn" data-mode="direct">${__(
			"申请单直录"
		)}</button>
		`);
	};

	const show = () => {
		if (state.mode === "direct") {
			$steps.html("");
			render_direct();
		} else {
			render_steps();
			render_step();
		}
	};

	$panel.find(".rq-mode").on("click", ".rq-mode-btn", function () {
		state.mode = $(this).attr("data-mode");
		state.step = 0;
		render_mode();
		show();
	});

	const render_direct = () => {
		const customers = state.options ? state.options.customers || [] : [];
		const pools = state.options ? state.options.pools || [] : [];
		const tenantUsers = state.options ? state.options.tenant_users || [] : [];
		const app = state.app;
		const created = app.name
			? `<span class="badge badge-success">${__("申请单")} ${esc(app.name)}</span>`
			: "";

		$body.html(`
			<h6 class="rq-title">${__("申请单直录")}</h6>
			<div class="rq-row">
				<label>${__("客户")}</label>
				<select class="form-select form-select-sm app-customer" style="max-width:320px" ${app.name ? "disabled" : ""}>
					<option value="">${__("请选择客户")}</option>
					${customers
						.map(
							(c) =>
								`<option value="${esc(c.name)}" ${c.name === app.customer ? "selected" : ""}>${esc(c.customer_name)}</option>`
						)
						.join("")}
				</select>
				<button class="btn btn-sm btn-primary app-create" ${app.name ? "disabled" : ""}>${__("生成申请单")}</button>
				${created}
			</div>

			<fieldset class="mt-3" ${app.name ? "" : "disabled"}>
				<div class="rq-row">
					<label>${__("资源池")}</label>
					<select class="form-select form-select-sm app-pool" style="max-width:320px">
						<option value="">${__("请选择资源池")}</option>
						${pools
							.map(
								(p) =>
									`<option value="${esc(p.name)}" ${p.name === app.resource_pool ? "selected" : ""}>${esc(p.pool_name)}（${esc(p.name)}）</option>`
							)
							.join("")}
					</select>
				</div>
				<table class="table table-sm table-bordered rq-list app-items">
					<thead class="thead-light"><tr>
						<th style="width:50%">${__("产品")}</th>
						<th style="width:110px">${__("数量")}</th>
						<th style="width:110px">${__("租赁月数")}</th>
						<th style="width:40px"></th>
					</tr></thead>
					<tbody></tbody>
				</table>
				<button class="btn btn-sm btn-outline-secondary app-add-item">${__("添加产品")}</button>
				<div class="rq-row mt-3">
					<label>${__("交付 IP")}</label>
					<input class="form-control form-control-sm app-ip" style="max-width:260px">
				</div>
				<div class="rq-row">
					<label>${__("登录账户")}</label>
					<input class="form-control form-control-sm app-account" style="max-width:260px">
				</div>
				<div class="rq-row">
					<label>${__("登录密码")}</label>
					<input type="password" class="form-control form-control-sm app-password" style="max-width:260px">
				</div>
				<div class="rq-row">
					<label>${__("租户用户")}</label>
					<select class="form-select form-select-sm app-tenant" style="max-width:320px">
						<option value="">${__("请选择租户用户")}</option>
						${tenantUsers
							.map((u) => `<option value="${esc(u.name)}">${esc(u.name)}（${esc(u.full_name)}）</option>`)
							.join("")}
					</select>
					<span class="small text-muted">${__("推送将发送给该用户")}</span>
				</div>
				<div class="rq-actions">
					<button class="btn btn-sm btn-default app-save">${__("保存草稿")}</button>
					<button class="btn btn-sm btn-success app-complete">${__("完成并推送到租户用户")}</button>
				</div>
				<div class="app-msg mt-2"></div>
			</fieldset>
		`);

		const $tbody = $body.find(".app-items tbody");
		const add_item = (item) => {
			const row = $(`<tr>
				<td><select class="form-select form-select-sm i-product">${(state.options ? state.options.products || [] : [])
					.map((p) => `<option value="${esc(p.name)}">${esc(p.product_name)}</option>`)
					.join("")}</select></td>
				<td><input type="number" class="form-control form-control-sm i-qty" value="${esc(
					(item && item.quantity) || 1
				)}" min="1" step="any"></td>
				<td><input type="number" class="form-control form-control-sm i-months" value="${esc(
					(item && item.lease_months) || 1
				)}" min="1" step="1"></td>
				<td><button class="btn btn-sm btn-outline-danger i-del">&times;</button></td>
			</tr>`);
			if (item) row.find(".i-product").val(item.product);
			row.find(".i-del").on("click", () => {
				if ($tbody.find("tr").length > 1) row.remove();
			});
			$tbody.append(row);
		};

		if (app.items && app.items.length) app.items.forEach(add_item);
		else add_item();

		$body.find(".app-add-item").on("click", () => add_item());

		$body.find(".app-create").on("click", () => {
			const customer = $body.find(".app-customer").val();
			const $msg = $body.find(".app-msg");
			if (!customer) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请选择客户")}</div>`);
				return;
			}
			api("create_application", { customer: customer })
				.then((res) => {
					state.app.name = res.name;
					state.app.customer = res.customer;
					render_direct();
				})
				.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err)}</div>`));
		});

		const collect_app = () => ({
			name: state.app.name,
			resource_pool: $body.find(".app-pool").val(),
			items: $tbody
				.find("tr")
				.map(function () {
					return {
						product: $(this).find(".i-product").val(),
						quantity: $(this).find(".i-qty").val(),
						lease_months: $(this).find(".i-months").val(),
					};
				})
				.get(),
			delivery_ip: $body.find(".app-ip").val(),
			login_account: $body.find(".app-account").val(),
			login_password: $body.find(".app-password").val(),
			tenant_user: $body.find(".app-tenant").val(),
		});

		$body.find(".app-save").on("click", () => {
			const $msg = $body.find(".app-msg");
			$msg.html("");
			api("save_application", { values: collect_app() })
				.then((res) => {
					$msg.html(
						`<div class="alert alert-success small mb-0">${__("已保存草稿")}：${esc(res.name)}（${esc(
							res.item_count
						)} ${__("条明细")}）</div>`
					);
				})
				.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err)}</div>`));
		});

		$body.find(".app-complete").on("click", () => {
			const $msg = $body.find(".app-msg");
			$msg.html("");
			const values = collect_app();
			if (!values.resource_pool) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请选择资源池")}</div>`);
				return;
			}
			api("save_application", { values: values })
				.then(() => api("complete_and_push", { name: state.app.name }))
				.then((res) => {
					state.app.name = "";
					state.app.customer = "";
					show();
					$msg.html(
						`<div class="alert alert-success small mb-0">${__("已完成并推送")}：${esc(res.name)}（${__(
							"推送渠道"
						)}：${esc((res.pushed || []).join("、") || __("无"))}）</div>`
					);
				})
				.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err)}</div>`));
		});
	};

	page.set_primary_action(__("重新开始"), () => {
		state.step = 0;
		state.payload = {
			lease_order: "",
			products: [],
			delivery_items: [],
			tags: [],
			readings: [],
			notify_elink_bot: 0,
			notify_sms: 0,
		};
		state.app = {
			name: "",
			customer: "",
			resource_pool: "",
			items: [],
			delivery_ip: "",
			login_account: "",
			login_password: "",
			tenant_user: "",
		};
		show();
	});

	render_mode();
	show();
	load().then(() => {
		// 选项是异步加载的；下拉在选项就绪后重绘，避免首屏为空
		show();
	});
};
