frappe.pages["expansion-control"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.expansion_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("扩容物控"),
		single_column: true,
	});

	$(`<style>
		.exp-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.exp-steps { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
		.exp-step { padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 999px; font-size: 12px; }
		.exp-step.active { background: var(--blue-500); color: #fff; border-color: var(--blue-500); }
		.exp-step.done { background: var(--control-bg); }
		.exp-title { margin: 0 0 10px; font-weight: 600; }
		.exp-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
		.exp-row label { flex: 0 0 96px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.exp-actions { display: flex; gap: 8px; margin-top: 12px; }
		.exp-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.exp-list th, .exp-list td { font-size: 12px; vertical-align: middle; }
		.exp-empty { color: var(--text-muted); font-size: 12px; }
		.exp-mode { display: flex; gap: 12px; margin-bottom: 16px; }
	</style>`).appendTo(page.main);

	const $panel = $(`<div class="exp-panel">
		<div class="exp-mode"></div>
		<div class="exp-steps"></div>
		<div class="exp-body"></div>
	</div>`).appendTo(page.main);

	const $mode = $panel.find(".exp-mode");
	const $steps = $panel.find(".exp-steps");
	const $body = $panel.find(".exp-body");

	const state = {
		mode: null,
		step: 0,
		options: null,
		materials: [],
		payload: {
			data_center: "",
			network_zone: "",
			region: "",
			pool: "",
			new_pool: null,
			demand: { mode: "product", items: [{ product: "", quantity: 1 }], capacity: { cpu: 0, memory: 0, storage: 0 } },
		},
		plan: null,
	};

	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
	};
	const opts = (rows, value_key, label_key, placeholder) =>
		`<option value="">${esc(placeholder || __("请选择"))}</option>` +
		rows.map((r) => `<option value="${esc(r[value_key])}">${esc(r[label_key])}</option>`).join("");

	const NEW_SEQUENCE = [
		{ key: "data_center", title: __("数据中心") },
		{ key: "network_zone", title: __("网络分区") },
		{ key: "region", title: __("区域") },
		{ key: "pool_new", title: __("新建资源池") },
		{ key: "material", title: __("物料库存") },
		{ key: "demand", title: __("需求量") },
		{ key: "result", title: __("物控表") },
	];
	const EXPAND_SEQUENCE = [
		{ key: "pool_pick", title: __("选择资源池") },
		{ key: "material", title: __("物料库存") },
		{ key: "demand", title: __("需求量") },
		{ key: "result", title: __("物控表") },
	];

	const sequence = () => (state.mode === "new" ? NEW_SEQUENCE : EXPAND_SEQUENCE);

	const render_mode = () => {
		$mode.html(`
			<h6 class="exp-title">${__("选择序列")}</h6>
			<button class="btn btn-sm ${state.mode === "new" ? "btn-primary" : "btn-default"} exp-mode-btn" data-mode="new">${__(
			"新建资源池"
		)}</button>
			<button class="btn btn-sm ${state.mode === "expand" ? "btn-primary" : "btn-default"} exp-mode-btn" data-mode="expand">${__(
			"扩容已有资源池"
		)}</button>
		`);
	};

	const render_steps = () => {
		const steps = sequence();
		$steps.html(
			steps
				.map(
					(step, idx) =>
						`<span class="exp-step ${idx === state.step ? "active" : ""} ${idx < state.step ? "done" : ""}">
							${esc(idx + 1)}. ${esc(step.title)}</span>`
				)
				.join("")
		);
	};

	const node_step = (step, label, list_key, value_key, label_key, create_fields) => {
		const rows = state.options ? state.options[list_key] : [];
		$body.html(`
			<h6 class="exp-title">${esc(label)}</h6>
			<div class="exp-row">
				<label>${__("选择已有")}</label>
				<select class="form-select form-select-sm exp-pick" style="max-width:320px">
					${opts(rows, value_key, label_key)}
				</select>
			</div>
			<div class="exp-row align-items-start">
				<label>${__("或新建")}</label>
				<div style="flex:1 1 auto">
					${create_fields
						.map(
							(f) =>
								`<input class="form-control form-control-sm mb-1 exp-create" data-key="${esc(
									f.key
								)}" placeholder="${esc(f.placeholder)}" style="max-width:320px">`
						)
						.join("")}
				</div>
			</div>
			<div class="exp-actions">
				<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
				<button class="btn btn-sm btn-primary exp-next">${__("下一步")}</button>
			</div>
			<div class="exp-msg mt-2"></div>
		`);

		if (state.payload[step.key]) $body.find(".exp-pick").val(state.payload[step.key]);
	};

	const render_step = () => {
		const step = sequence()[state.step];
		if (!step) return;

		if (step.key === "data_center") {
			node_step(step, __("数据中心（机房）"), "data_centers", "name", "data_center_name", [
				{ key: "data_center_name", placeholder: __("数据中心名称") },
				{ key: "city", placeholder: __("城市") },
			]);
		} else if (step.key === "network_zone") {
			node_step(step, __("网络分区"), "zones", "name", "zone_name", [
				{ key: "zone_name", placeholder: __("网络分区名称") },
				{ key: "cidr", placeholder: __("网段，如 10.40.0.0/16") },
			]);
		} else if (step.key === "region") {
			node_step(step, __("区域"), "regions", "name", "region_name", [
				{ key: "region_name", placeholder: __("区域名称") },
			]);
		} else if (step.key === "pool_new") {
			render_new_pool();
		} else if (step.key === "pool_pick") {
			render_pool_pick();
		} else if (step.key === "material") {
			render_material();
		} else if (step.key === "demand") {
			render_demand();
		} else {
			render_result();
		}
	};

	const render_new_pool = () => {
		const p = state.payload.new_pool || {};
		$body.html(`
			<h6 class="exp-title">${__("新建资源池")}</h6>
			<div class="exp-row">
				<label>${__("资源池名称")}</label>
				<input class="form-control form-control-sm np-name" value="${esc(p.pool_name || "")}" style="max-width:280px">
				<label style="flex:0 0 auto">${__("类型")}</label>
				<select class="form-select form-select-sm np-type" style="max-width:140px">
					<option value="计算">${__("计算")}</option>
					<option value="存储">${__("存储")}</option>
					<option value="网络">${__("网络")}</option>
				</select>
				<label style="flex:0 0 auto">${__("架构")}</label>
				<select class="form-select form-select-sm np-arch" style="max-width:140px">
					<option value="x86">x86</option>
					<option value="ARM">ARM</option>
					<option value="RISC-V">RISC-V</option>
					<option value="异构混合">${__("异构混合")}</option>
				</select>
			</div>
			<div class="exp-row">
				<label>${__("初始 CPU（核）")}</label>
				<input type="number" class="form-control form-control-sm np-cpu" value="${esc(p.cpu_total || 0)}" style="max-width:130px">
				<label style="flex:0 0 auto">${__("内存（GB）")}</label>
				<input type="number" class="form-control form-control-sm np-mem" value="${esc(p.memory_total || 0)}" style="max-width:130px">
				<label style="flex:0 0 auto">${__("存储（TB）")}</label>
				<input type="number" class="form-control form-control-sm np-sto" value="${esc(p.storage_total || 0)}" style="max-width:130px">
			</div>
			<div class="exp-actions">
				<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
				<button class="btn btn-sm btn-primary exp-next">${__("下一步")}</button>
			</div>
		`);
		$body.find(".np-type").val(p.pool_type || "计算");
		$body.find(".np-arch").val(p.architecture || "x86");
	};

	const render_pool_pick = () => {
		const rows = state.options ? state.options.pools : [];
		$body.html(`
			<h6 class="exp-title">${__("选择要扩容的资源池")}</h6>
			<div class="exp-row">
				<label>${__("资源池")}</label>
				<select class="form-select form-select-sm exp-pool" style="max-width:340px">
					${opts(rows, "name", "pool_name")}
				</select>
			</div>
			<div class="exp-pool-info mt-2"></div>
			<div class="exp-actions">
				<button class="btn btn-sm btn-primary exp-next">${__("下一步")}</button>
			</div>
		`);
		if (state.payload.pool) $body.find(".exp-pool").val(state.payload.pool);
		$body.find(".exp-pool").on("change", show_pool_info);
		show_pool_info();
	};

	const show_pool_info = () => {
		const name = $body.find(".exp-pool").val();
		const row = (state.options.pools || []).find((p) => p.name === name);
		$body.find(".exp-pool-info").html(
			row
				? `<div class="small">${esc(row.pool_name)}<span class="exp-tag">${esc(row.architecture)}</span>
					<span class="exp-tag">${__("CPU")} ${esc(num(row.cpu_used))}/${esc(num(row.cpu_total))}${esc(__("核"))}</span>
					<span class="exp-tag">${__("内存")} ${esc(num(row.memory_used))}/${esc(num(row.memory_total))}GB</span>
					<span class="exp-tag">${__("存储")} ${esc(num(row.storage_used))}/${esc(num(row.storage_total))}TB</span></div>`
				: ""
		);
	};

	const render_material = () => {
		const pool = state.payload.pool;
		$body.html(`<div class="exp-empty">${__("加载中")}...</div>`);
		api("get_material_stock", { pool: pool || null }).then((rows) => {
			state.materials = rows;
			if (!rows.length) {
				$body.html(`
					<h6 class="exp-title">${__("物料库存")}</h6>
					<div class="exp-empty">${__("该资源池暂无物料库存记录，可直接进入需求量")}</div>
					<div class="exp-actions">
						<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
						<button class="btn btn-sm btn-primary exp-next">${__("下一步")}</button>
					</div>
				`);
				return;
			}

			$body.html(`
				<h6 class="exp-title">${__("选择本次可用的物料库存")}</h6>
				<table class="table table-sm table-bordered exp-list">
					<thead class="thead-light"><tr>
						<th style="width:40px"></th><th>${__("物料")}</th><th>${__("来源资源池")}</th>
						<th class="text-right">${__("总量")}</th><th class="text-right">${__("已用")}</th>
						<th class="text-right">${__("可用")}</th>
					</tr></thead>
					<tbody>
						${rows
							.map(
								(r) => `<tr>
									<td><input type="checkbox" class="exp-mat" data-name="${esc(r.name)}"
										data-product="${esc(r.product)}" data-available="${esc(r.available_qty)}" checked></td>
									<td>${esc(r.product_name || r.product)}<span class="exp-tag">${esc(r.product)}</span></td>
									<td>${esc(r.pool_name || r.resource_pool || "")}</td>
									<td class="text-right">${esc(num(r.total_qty))}</td>
									<td class="text-right">${esc(num(r.used_qty))}</td>
									<td class="text-right">${esc(num(r.available_qty))}</td>
								</tr>`
							)
							.join("")}
					</tbody>
				</table>
				<div class="exp-actions">
					<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
					<button class="btn btn-sm btn-primary exp-next">${__("下一步")}</button>
				</div>
			`);
		});
	};

	const render_demand = () => {
		const demand = state.payload.demand;
		const products = state.options ? state.options.products : [];
		const is_product = demand.mode === "product";

		const item_rows = (demand.items || [])
			.map(
				(item) => `<tr>
					<td><select class="form-select form-select-sm d-product" style="width:100%">
						${opts(products, "name", "product_name")}</select></td>
					<td><input type="number" class="form-control form-control-sm d-qty" value="${esc(
						item.quantity || 1
					)}" min="1" step="any"></td>
					<td><button class="btn btn-sm btn-outline-danger d-del">&times;</button></td>
				</tr>`
			)
			.join("");

		$body.html(`
			<h6 class="exp-title">${__("输入需求量")}</h6>
			<div class="exp-row">
				<label>${__("需求形式")}</label>
				<select class="form-select form-select-sm d-mode" style="max-width:220px">
					<option value="product" ${is_product ? "selected" : ""}>${__("产品 + 数量")}</option>
					<option value="capacity" ${is_product ? "" : "selected"}>${__("总算力资源（CPU / 内存 / 存储）")}</option>
				</select>
			</div>
			<div class="d-product-block" style="display:${is_product ? "block" : "none"}">
				<table class="table table-sm exp-list">
					<thead class="thead-light"><tr>
						<th>${__("产品")}</th><th style="width:120px">${__("数量")}</th><th style="width:40px"></th>
					</tr></thead>
					<tbody>${item_rows}</tbody>
				</table>
				<button class="btn btn-sm btn-outline-secondary d-add">${__("添加产品")}</button>
			</div>
			<div class="d-capacity-block" style="display:${is_product ? "none" : "block"}">
				<div class="exp-row">
					<label>${__("CPU（核）")}</label>
					<input type="number" class="form-control form-control-sm d-cpu" value="${esc(
						demand.capacity.cpu || 0
					)}" style="max-width:140px">
					<label style="flex:0 0 auto">${__("内存（GB）")}</label>
					<input type="number" class="form-control form-control-sm d-mem" value="${esc(
						demand.capacity.memory || 0
					)}" style="max-width:140px">
					<label style="flex:0 0 auto">${__("存储（TB）")}</label>
					<input type="number" class="form-control form-control-sm d-sto" value="${esc(
						demand.capacity.storage || 0
					)}" style="max-width:140px">
				</div>
			</div>
			<div class="exp-actions">
				<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
				<button class="btn btn-sm btn-primary exp-next">${__("生成物控表")}</button>
			</div>
		`);

		$body.find(".d-mode").on("change", function () {
			const mode = $(this).val();
			state.payload.demand.mode = mode;
			$body.find(".d-product-block").toggle(mode === "product");
			$body.find(".d-capacity-block").toggle(mode === "capacity");
		});

		$body.find(".d-add").on("click", () => {
			$body.find(".exp-list tbody").append(`
				<tr>
					<td><select class="form-select form-select-sm d-product" style="width:100%">
						${opts(products, "name", "product_name")}</select></td>
					<td><input type="number" class="form-control form-control-sm d-qty" value="1" min="1" step="any"></td>
					<td><button class="btn btn-sm btn-outline-danger d-del">&times;</button></td>
				</tr>
			`);
		});
		$body.on("click", ".d-del", function () {
			if ($body.find(".exp-list tbody tr").length > 1) $(this).closest("tr").remove();
		});
		(demand.items || []).forEach((item, idx) => {
			$body.find(".d-product").eq(idx).val(item.product);
		});
	};

	const collect_demand = () => {
		const mode = $body.find(".d-mode").val();
		const demand = { mode: mode, items: [], capacity: { cpu: 0, memory: 0, storage: 0 } };
		if (mode === "product") {
			$body.find(".exp-list tbody tr").each(function () {
				const product = $(this).find(".d-product").val();
				const quantity = $(this).find(".d-qty").val();
				if (product) demand.items.push({ product: product, quantity: quantity });
			});
		} else {
			demand.capacity = {
				cpu: $body.find(".d-cpu").val(),
				memory: $body.find(".d-mem").val(),
				storage: $body.find(".d-sto").val(),
			};
		}
		state.payload.demand = demand;
		return demand;
	};

	const collect_materials = () => {
		const rows = [];
		$body.find(".exp-mat:checked").each(function () {
			rows.push({
				name: $(this).attr("data-name"),
				product: $(this).attr("data-product"),
				available_qty: $(this).attr("data-available"),
			});
		});
		return rows;
	};

	const render_result = () => {
		$body.html(`<div class="exp-empty">${__("计算中")}...</div>`);
		api("compute_material_plan", {
			payload: { pool: state.payload.pool || null, materials: collect_materials_cache(), demand: state.payload.demand },
		}).then(render_plan);
	};

	const collect_materials_cache = () => state.selected_materials || [];

	const render_plan = (plan) => {
		state.plan = plan;

		let material_rows = (plan.by_material || [])
			.map(
				(r) => `<tr>
					<td>${esc(r.product_name || r.product)}<span class="exp-tag">${esc(r.product)}</span></td>
					<td class="text-right">${esc(num(r.demand_qty))}</td>
					<td class="text-right">${esc(num(r.stock_qty))}</td>
					<td class="text-right ${r.gap_qty > 0 ? "text-danger" : ""}">${esc(num(r.gap_qty))}</td>
				</tr>`
			)
			.join("");

		let dim_rows = (plan.by_dimension || [])
			.map(
				(r) => `<tr>
					<td>${esc(r.label)}<span class="exp-tag">${esc(r.unit)}</span></td>
					<td class="text-right">${esc(num(r.demand))}</td>
					<td class="text-right">${esc(num(r.stock))}</td>
					<td class="text-right ${r.gap > 0 ? "text-danger" : ""}">${esc(num(r.gap))}</td>
				</tr>`
			)
			.join("");

		$body.html(`
			<h6 class="exp-title">${__("扩容物控表")}</h6>
			<div class="small text-muted mb-2">
				${__("资源池")}：<b>${esc(plan.pool_name || state.payload.new_pool?.pool_name || __("待新建"))}</b>
				<span class="exp-tag">${__("需求形式")}：${esc(
			plan.demand_mode === "capacity" ? __("总算力资源") : __("产品 + 数量")
		)}</span>
			</div>
			<div class="row">
				<div class="col-md-6">
					<h6 class="exp-title">${__("按物料")}</h6>
					<table class="table table-sm table-bordered exp-list">
						<thead class="thead-light"><tr>
							<th>${__("物料")}</th><th class="text-right">${__("需求")}</th>
							<th class="text-right">${__("库存")}</th><th class="text-right">${__("缺口")}</th>
						</tr></thead>
						<tbody>${material_rows || `<tr><td colspan="4" class="exp-empty">${__("无物料数据")}</td></tr>`}</tbody>
					</table>
				</div>
				<div class="col-md-6">
					<h6 class="exp-title">${__("按资源维度")}</h6>
					<table class="table table-sm table-bordered exp-list">
						<thead class="thead-light"><tr>
							<th>${__("维度")}</th><th class="text-right">${__("需求")}</th>
							<th class="text-right">${__("库存")}</th><th class="text-right">${__("缺口")}</th>
						</tr></thead>
						<tbody>${dim_rows}</tbody>
					</table>
				</div>
			</div>
			<div class="exp-actions">
				<button class="btn btn-sm btn-default exp-prev">${__("上一步")}</button>
				<label class="small mb-0"><input type="checkbox" class="exp-create-replenish" checked> ${__(
					"按缺口生成扩容补货单"
				)}</label>
				<button class="btn btn-sm btn-primary exp-save">${__("保存并落地")}</button>
			</div>
			<div class="exp-msg mt-2"></div>
		`);
	};

	$mode.on("click", ".exp-mode-btn", function () {
		state.mode = $(this).attr("data-mode");
		state.step = 0;
		state.plan = null;
		render_mode();
		render_steps();
		render_step();
	});

	$body.on("click", ".exp-prev", () => {
		if (state.step > 0) {
			state.step -= 1;
			render_steps();
			render_step();
		}
	});

	$body.on("click", ".exp-next", () => {
		const step = sequence()[state.step];
		const $msg = $body.find(".exp-msg");

		if (["data_center", "network_zone", "region"].includes(step.key)) {
			const picked = $body.find(".exp-pick").val();
			const created = {};
			$body.find(".exp-create").each(function () {
				created[$(this).attr("data-key")] = $(this).val();
			});

			const doctype =
				step.key === "data_center" ? "Data Center" : step.key === "network_zone" ? "Network Zone" : "Region";
			const parent_field = step.key === "network_zone" ? "data_center" : step.key === "region" ? "network_zone" : null;

			if (picked) {
				state.payload[step.key] = picked;
				next();
			} else if (created[Object.keys(created)[0]]) {
				const values = created;
				if (parent_field) values[parent_field] = state.payload[parent_field];
				frappe.xcall("cloudosp.lease_asset.resource_pool_api.save_org_record", {
					doctype: doctype,
					values: values,
				})
					.then((res) => {
						state.payload[step.key] = res.name;
						next();
					})
					.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err)}</div>`));
			} else {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请选择或填写名称")}</div>`);
			}
			return;
		}

		if (step.key === "pool_new") {
			const name = $body.find(".np-name").val();
			if (!name) {
				$body.find(".exp-msg").html(`<div class="alert alert-warning small mb-0">${__("请填写资源池名称")}</div>`);
				return;
			}
			state.payload.new_pool = {
				pool_name: name,
				pool_type: $body.find(".np-type").val(),
				architecture: $body.find(".np-arch").val(),
				region: state.payload.region,
				cpu_total: $body.find(".np-cpu").val(),
				memory_total: $body.find(".np-mem").val(),
				storage_total: $body.find(".np-sto").val(),
				status: "可用",
			};
			next();
			return;
		}

		if (step.key === "pool_pick") {
			const pool = $body.find(".exp-pool").val();
			if (!pool) {
				$body.find(".exp-msg").html(`<div class="alert alert-warning small mb-0">${__("请选择资源池")}</div>`);
				return;
			}
			state.payload.pool = pool;
			next();
			return;
		}

		if (step.key === "material") {
			state.selected_materials = $body.find(".exp-mat").length ? collect_materials() : [];
			next();
			return;
		}

		if (step.key === "demand") {
			collect_demand();
			next();
			return;
		}

		next();
	});

	const next = () => {
		state.step = Math.min(state.step + 1, sequence().length - 1);
		render_steps();
		render_step();
	};

	$body.on("click", ".exp-save", function () {
		const $msg = $body.find(".exp-msg");
		$msg.html("");
		api("save_expansion_result", {
			payload: {
				pool: state.payload.pool || null,
				new_pool: state.mode === "new" ? state.payload.new_pool : null,
				materials: state.selected_materials || [],
				demand: state.payload.demand,
				create_replenish: $body.find(".exp-create-replenish").is(":checked") ? 1 : 0,
			},
		})
			.then((plan) => {
				render_plan(plan);
				const created = plan.created || {};
				$body
					.find(".exp-msg")
					.html(
						`<div class="alert alert-success small mb-0">${__("已落地")}：${
							created.pool ? __("资源池") + " " + esc(created.pool) + " " : ""
						}${created.replenish ? __("扩容补货单") + " " + esc(created.replenish) : __("无缺口，未生成补货单")}</div>`
					);
			})
			.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err)}</div>`));
	});

	const load = () => {
		api("get_expansion_options").then((res) => {
			state.options = res;
		});
	};

	page.set_primary_action(__("重新开始"), () => {
		state.mode = null;
		state.step = 0;
		state.plan = null;
		state.payload = {
			data_center: "",
			network_zone: "",
			region: "",
			pool: "",
			new_pool: null,
			demand: { mode: "product", items: [{ product: "", quantity: 1 }], capacity: { cpu: 0, memory: 0, storage: 0 } },
		};
		state.selected_materials = [];
		render_mode();
		$steps.html("");
		$body.html(`<div class="exp-empty">${__("请选择上方的序列开始")}</div>`);
	});

	render_mode();
	$body.html(`<div class="exp-empty">${__("请选择上方的序列开始")}</div>`);
	load();
};
