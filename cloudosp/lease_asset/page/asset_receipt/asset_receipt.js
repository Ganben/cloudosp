frappe.pages["asset-receipt"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.receipt_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("资产扩容接收"),
		single_column: true,
	});

	$(`<style>
		.rc-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.rc-steps { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
		.rc-step { padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 999px; font-size: 12px; }
		.rc-step.active { background: var(--blue-500); color: #fff; border-color: var(--blue-500); }
		.rc-step.done { background: var(--control-bg); }
		.rc-title { margin: 0 0 10px; font-weight: 600; }
		.rc-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
		.rc-row label { flex: 0 0 110px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.rc-actions { display: flex; gap: 8px; margin-top: 12px; }
		.rc-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.rc-list th, .rc-list td { font-size: 12px; vertical-align: middle; }
		.rc-empty { color: var(--text-muted); font-size: 12px; }
	</style>`).appendTo(page.main);

	const $panel = $(`<div class="rc-panel">
		<div class="rc-steps"></div>
		<div class="rc-body"></div>
	</div>`).appendTo(page.main);

	const $steps = $panel.find(".rc-steps");
	const $body = $panel.find(".rc-body");

	const STEPS = [
		{ key: "target", title: __("资源池 / 补货单") },
		{ key: "discover", title: __("未录入资产") },
		{ key: "items", title: __("资产序列号") },
		{ key: "cost", title: __("成本") },
		{ key: "capacity", title: __("容量入库") },
		{ key: "finish", title: __("完成接收") },
	];

	const state = {
		step: 0,
		options: null,
		discovered: [],
		selected: [],
		payload: {
			resource_pool: "",
			replenish_order: "",
			receipt_date: frappe.datetime.now_date(),
			items: [],
			capacity_items: [],
			total_cost: 0,
			capital_cost: 0,
			expense_cost: 0,
			remarks: "",
		},
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
					`<span class="rc-step ${idx === state.step ? "active" : ""} ${idx < state.step ? "done" : ""}">
						${esc(idx + 1)}. ${esc(step.title)}</span>`
			).join("")
		);
	};

	const nav_buttons = (with_prev = true) =>
		`<div class="rc-actions">
			${with_prev ? `<button class="btn btn-sm btn-default rc-prev">${__("上一步")}</button>` : ""}
			<button class="btn btn-sm btn-primary rc-next">${__("下一步")}</button>
		</div>`;

	const render_target = () => {
		const pools = state.options ? state.options.pools : [];
		const orders = state.options ? state.options.replenish_orders : [];
		$body.html(`
			<h6 class="rc-title">${__("选择资源池与关联的扩容补货单")}</h6>
			<div class="rc-row">
				<label>${__("资源池")}</label>
				<select class="form-select form-select-sm rc-pool" style="max-width:340px">
					<option value="">${__("请选择资源池")}</option>
					${pools
						.map(
							(p) =>
								`<option value="${esc(p.name)}">${esc(p.pool_name)}（${esc(p.architecture || "")}）</option>`
						)
						.join("")}
				</select>
			</div>
			<div class="rc-row">
				<label>${__("扩容补货单")}</label>
				<select class="form-select form-select-sm rc-order" style="max-width:340px">
					<option value="">${__("不关联")}</option>
					${orders
						.map(
							(o) =>
								`<option value="${esc(o.name)}">${esc(o.name)} · ${esc(
									o.pool_name || o.resource_pool || ""
								)} · ${esc(o.replenish_type)}</option>`
						)
						.join("")}
				</select>
			</div>
			<div class="rc-row">
				<label>${__("接收日期")}</label>
				<input type="date" class="form-control form-control-sm rc-date" value="${esc(
					state.payload.receipt_date
				)}" style="max-width:180px">
			</div>
			<div class="rc-actions">
				<button class="btn btn-sm btn-primary rc-next">${__("下一步")}</button>
			</div>
			<div class="rc-msg mt-2"></div>
		`);
		$body.find(".rc-pool").val(state.payload.resource_pool || "");
		$body.find(".rc-order").val(state.payload.replenish_order || "");
	};

	const render_discover = () => {
		$body.html(`
			<h6 class="rc-title">${__("外部事实账中尚未录入的资产")}</h6>
			<div class="rc-row">
				<label>${__("标签")}</label>
				<input class="form-control form-control-sm rc-tag-input" placeholder="${__(
					"按资产类别 / 位置过滤"
				)}" style="max-width:220px">
				<label style="flex:0 0 auto">${__("关键字")}</label>
				<input class="form-control form-control-sm rc-keyword" placeholder="${__(
					"名称 / 编号 / 序列号"
				)}" style="max-width:220px">
				<button class="btn btn-sm btn-default rc-search">${__("查询")}</button>
			</div>
			<div class="rc-found"></div>
			${nav_buttons()}
		`);
		$body.find(".rc-search").on("click", search_assets);
		search_assets();
	};

	const search_assets = () => {
		const $found = $body.find(".rc-found");
		$found.html(`<div class="rc-empty">${__("加载中")}...</div>`);
		api("discover_assets", {
			tag: $body.find(".rc-tag-input").val(),
			keyword: $body.find(".rc-keyword").val(),
		})
			.then((rows) => {
				state.discovered = rows;
				if (!rows.length) {
					$found.html(`<div class="rc-empty">${__("没有发现未录入的资产")}</div>`);
					return;
				}
				$found.html(`
					<table class="table table-sm table-bordered rc-list">
						<thead class="thead-light"><tr>
							<th style="width:40px"></th><th>${__("资产")}</th><th>${__("名称")}</th>
							<th>${__("标签")}</th><th>${__("位置")}</th><th>${__("状态")}</th><th>${__("序列号")}</th>
						</tr></thead>
						<tbody>
							${rows
								.map(
									(r) => `<tr>
										<td><input type="checkbox" class="rc-pick" data-name="${esc(r.name)}"
											data-serial="${esc(r.serial_no || "")}" data-tag="${esc(r.tag || "")}"
											data-asset-name="${esc(r.asset_name || "")}"></td>
										<td>${esc(r.name)}</td>
										<td>${esc(r.asset_name || "")}</td>
										<td>${esc(r.tag || "")}</td>
										<td>${esc(r.location || "")}</td>
										<td>${esc(r.status || "")}</td>
										<td>${esc(r.serial_no || "")}</td>
									</tr>`
								)
								.join("")}
						</tbody>
					</table>
				`);
			})
			.catch((err) => $found.html(`<div class="rc-empty">${esc(err || __("加载失败"))}</div>`));
	};

	const render_items = () => {
		const rows = state.payload.items.length
			? state.payload.items
			: [{ serial_no: "", asset: "", tag: "", source: "手工录入" }];

		$body.html(`
			<h6 class="rc-title">${__("录入 / 上传资产序列号")}</h6>
			<div class="rc-row align-items-start">
				<label>${__("批量粘贴")}</label>
				<textarea class="form-control form-control-sm rc-bulk" rows="3"
					placeholder="${__("每行一个序列号，支持 CSV 首列")}" style="max-width:420px"></textarea>
				<button class="btn btn-sm btn-default rc-parse">${__("解析")}</button>
			</div>
			<table class="table table-sm rc-list">
				<thead class="thead-light"><tr>
					<th style="width:34%">${__("资产序列号")}</th><th style="width:26%">${__("资产（Asset）")}</th>
					<th>${__("标签")}</th><th>${__("来源")}</th><th style="width:40px"></th>
				</tr></thead>
				<tbody>
					${rows
						.map(
							(row) => `<tr>
								<td><input class="form-control form-control-sm i-serial" value="${esc(row.serial_no || "")}"></td>
								<td><input class="form-control form-control-sm i-asset" value="${esc(row.asset || "")}"
									placeholder="${__("可选，Asset 编号")}"></td>
								<td><input class="form-control form-control-sm i-tag" value="${esc(row.tag || "")}"></td>
								<td><select class="form-select form-select-sm i-source">
									<option value="自动发现">${__("自动发现")}</option>
									<option value="手工录入">${__("手工录入")}</option>
									<option value="上传导入">${__("上传导入")}</option>
								</select></td>
								<td><button class="btn btn-sm btn-outline-danger i-del">&times;</button></td>
							</tr>`
						)
						.join("")}
				</tbody>
			</table>
			<button class="btn btn-sm btn-outline-secondary rc-add">${__("添加行")}</button>
			${nav_buttons()}
			<div class="rc-msg mt-2"></div>
		`);

		rows.forEach((row, idx) => {
			$body.find(".i-source").eq(idx).val(row.source || "手工录入");
		});

		$body.find(".rc-add").on("click", () => {
			$body.find(".rc-list tbody").append(`
				<tr>
					<td><input class="form-control form-control-sm i-serial"></td>
					<td><input class="form-control form-control-sm i-asset" placeholder="${__("可选")}"></td>
					<td><input class="form-control form-control-sm i-tag"></td>
					<td><select class="form-select form-select-sm i-source">
						<option value="自动发现">${__("自动发现")}</option>
						<option value="手工录入">${__("手工录入")}</option>
						<option value="上传导入">${__("上传导入")}</option>
					</select></td>
					<td><button class="btn btn-sm btn-outline-danger i-del">&times;</button></td>
				</tr>
			`);
		});
		$body.on("click", ".i-del", function () {
			if ($body.find(".rc-list tbody tr").length > 1) $(this).closest("tr").remove();
		});
		$body.find(".rc-parse").on("click", () => {
			const lines = ($body.find(".rc-bulk").val() || "")
				.split(/\r?\n/)
				.map((line) => (line.split(/[,\t;]/)[0] || "").trim())
				.filter(Boolean);
			if (!lines.length) return;
			$body.find(".rc-list tbody tr").remove();
			lines.forEach((serial) => {
				$body.find(".rc-add").trigger("click");
				$body.find(".rc-list tbody tr").last().find(".i-serial").val(serial);
				$body.find(".rc-list tbody tr").last().find(".i-source").val("上传导入");
			});
		});
	};

	const collect_items = () => {
		const items = [];
		$body.find(".rc-list tbody tr").each(function () {
			const $row = $(this);
			const serial = $row.find(".i-serial").val();
			const asset = $row.find(".i-asset").val();
			if (!serial && !asset) return;
			items.push({
				serial_no: serial,
				asset: asset,
				tag: $row.find(".i-tag").val(),
				source: $row.find(".i-source").val(),
			});
		});
		state.payload.items = items;
		return items;
	};

	const render_cost = () => {
		$body.html(`
			<h6 class="rc-title">${__("成本录入")}</h6>
			<div class="rc-row">
				<label>${__("总成本（必填）")}</label>
				<input type="number" class="form-control form-control-sm c-total" value="${esc(
					state.payload.total_cost || 0
				)}" style="max-width:160px">
				<label style="flex:0 0 auto">${__("资本成本（可选）")}</label>
				<input type="number" class="form-control form-control-sm c-capital" value="${esc(
					state.payload.capital_cost || 0
				)}" style="max-width:160px">
				<label style="flex:0 0 auto">${__("费用成本（可选）")}</label>
				<input type="number" class="form-control form-control-sm c-expense" value="${esc(
					state.payload.expense_cost || 0
				)}" style="max-width:160px">
			</div>
			<div class="rc-row align-items-start">
				<label>${__("备注")}</label>
				<textarea class="form-control form-control-sm c-remarks" rows="2" style="max-width:420px">${esc(
					state.payload.remarks || ""
				)}</textarea>
			</div>
			${nav_buttons()}
			<div class="rc-msg mt-2"></div>
		`);
	};

	const capacity_row_html = (row) => {
		const products = state.options ? state.options.products : [];
		return `<tr>
			<td><select class="form-select form-select-sm k-type">
				<option value="容量">${__("容量")}</option>
				<option value="物料">${__("物料")}</option>
			</select></td>
			<td class="c-cap"><select class="form-select form-select-sm k-dim">
				<option value="CPU">${__("CPU")}</option>
				<option value="内存">${__("内存")}</option>
				<option value="存储">${__("存储")}</option>
			</select></td>
			<td class="c-cap"><input type="number" class="form-control form-control-sm k-qty"
				value="${esc(row.capacity_qty || 0)}" step="any"></td>
			<td class="c-mat"><select class="form-select form-select-sm k-product">
				<option value="">${__("请选择物料")}</option>
				${products
					.map(
						(p) =>
							`<option value="${esc(p.name)}">${esc(p.product_name)}<span class="rc-tag">${esc(
								p.dimensions ? `${p.dimensions.cpu}${__("核")} / ${p.dimensions.memory}GB / ${p.dimensions.storage}TB` : ""
							)}</span></option>`
					)
					.join("")}
			</select></td>
			<td class="c-mat"><input type="number" class="form-control form-control-sm k-mqty"
				value="${esc(row.quantity || 0)}" step="any"></td>
			<td><button class="btn btn-sm btn-outline-danger k-del">&times;</button></td>
		</tr>`;
	};

	const apply_capacity_mode = ($row) => {
		const is_cap = $row.find(".k-type").val() === "容量";
		$row.find(".c-cap").toggle(is_cap);
		$row.find(".c-mat").toggle(!is_cap);
	};

	const render_capacity = () => {
		const rows = state.payload.capacity_items.length
			? state.payload.capacity_items
			: [{ entry_type: "容量", dimension: "CPU", capacity_qty: 0 }];

		$body.html(`
			<h6 class="rc-title">${__("容量入库")}</h6>
			<div class="small text-muted mb-2">
				${__("容量条目累加到资源池容量；物料条目累加到该资源池的产品库存")}
			</div>
			<table class="table table-sm rc-list rc-cap-list">
				<thead class="thead-light"><tr>
					<th style="width:90px">${__("类型")}</th>
					<th class="c-cap" style="width:110px">${__("资源维度")}</th>
					<th class="c-cap" style="width:110px">${__("容量数量")}</th>
					<th class="c-mat" style="width:240px">${__("物料项目")}</th>
					<th class="c-mat" style="width:110px">${__("物料数量")}</th>
					<th style="width:40px"></th>
				</tr></thead>
				<tbody>${rows.map(capacity_row_html).join("")}</tbody>
			</table>
			<button class="btn btn-sm btn-outline-secondary k-add">${__("添加行")}</button>
			${state.payload.replenish_order
				? `<button class="btn btn-sm btn-default k-from-order">${__("从补货单带入")}</button>`
				: ""}
			${nav_buttons()}
			<div class="rc-msg mt-2"></div>
		`);

		rows.forEach((row, idx) => {
			const $row = $body.find(".rc-cap-list tbody tr").eq(idx);
			$row.find(".k-type").val(row.entry_type || "容量");
			$row.find(".k-dim").val(row.dimension || "CPU");
			$row.find(".k-product").val(row.product || "");
			apply_capacity_mode($row);
		});

		$body.find(".k-add").on("click", () => {
			$body.find(".rc-cap-list tbody").append(capacity_row_html({ entry_type: "容量", dimension: "CPU", capacity_qty: 0 }));
			apply_capacity_mode($body.find(".rc-cap-list tbody tr").last());
		});
		$body.on("click", ".k-del", function () {
			if ($body.find(".rc-cap-list tbody tr").length > 1) $(this).closest("tr").remove();
		});
		$body.on("change", ".k-type", function () {
			apply_capacity_mode($(this).closest("tr"));
		});
		$body.find(".k-from-order").on("click", () => {
			api("get_replenish_capacity", { replenish_order: state.payload.replenish_order }).then((entries) => {
				if (!entries || !entries.length) {
					$body
						.find(".rc-msg")
						.html(`<div class="alert alert-warning small mb-0">${__("该补货单没有可带入的容量")}</div>`);
					return;
				}
				state.payload.capacity_items = entries;
				render_capacity();
			});
		});
	};

	const collect_capacity = () => {
		const rows = [];
		$body.find(".rc-cap-list tbody tr").each(function () {
			const $row = $(this);
			const type = $row.find(".k-type").val();
			if (type === "容量") {
				const qty = Number($row.find(".k-qty").val() || 0);
				if (!qty) return;
				rows.push({ entry_type: "容量", dimension: $row.find(".k-dim").val(), capacity_qty: qty });
			} else {
				const product = $row.find(".k-product").val();
				const qty = Number($row.find(".k-mqty").val() || 0);
				if (!product || !qty) return;
				rows.push({ entry_type: "物料", product: product, quantity: qty });
			}
		});
		state.payload.capacity_items = rows;
		return rows;
	};

	const render_finish = () => {
		const items = state.payload.items || [];
		$body.html(`
			<h6 class="rc-title">${__("完成资产扩容接收")}</h6>
			<table class="table table-sm table-bordered rc-list" style="max-width:520px">
				<tbody>
					<tr><th>${__("资源池")}</th><td>${esc(state.payload.pool_name || state.payload.resource_pool)}</td></tr>
					<tr><th>${__("区域")}</th><td>${esc(state.payload.region || "")}</td></tr>
					<tr><th>${__("扩容补货单")}</th><td>${esc(state.payload.replenish_order || __("不关联"))}</td></tr>
					<tr><th>${__("接收日期")}</th><td>${esc(state.payload.receipt_date)}</td></tr>
					<tr><th>${__("资产条数")}</th><td>${esc(items.length)}</td></tr>
					${(state.payload.capacity_items || [])
						.map(
							(row) =>
								`<tr><th>${__("容量入库")}</th><td>${
									row.entry_type === "容量"
										? `${esc(row.dimension)} ${esc(num(row.capacity_qty))}`
										: `${esc(row.product)} × ${esc(num(row.quantity))}（${__("物料")}）`
								}</td></tr>`
						)
						.join("")}
					<tr><th>${__("总成本")}</th><td>${esc(num(state.payload.total_cost))}</td></tr>
					<tr><th>${__("资本成本")}</th><td>${esc(num(state.payload.capital_cost))}</td></tr>
					<tr><th>${__("费用成本")}</th><td>${esc(num(state.payload.expense_cost))}</td></tr>
				</tbody>
			</table>
			<div class="rc-actions">
				<button class="btn btn-sm btn-default rc-prev">${__("上一步")}</button>
				<button class="btn btn-sm btn-primary rc-finish">${__("确认完成接收")}</button>
			</div>
			<div class="rc-msg mt-2"></div>
		`);
	};

	const render_step = () => {
		const step = STEPS[state.step];
		if (step.key === "target") render_target();
		else if (step.key === "discover") render_discover();
		else if (step.key === "items") render_items();
		else if (step.key === "cost") render_cost();
		else if (step.key === "capacity") render_capacity();
		else render_finish();
	};

	$body.on("click", ".rc-prev", () => {
		state.step = Math.max(state.step - 1, 0);
		render_steps();
		render_step();
	});

	$body.on("click", ".rc-next", () => {
		const $msg = $body.find(".rc-msg");
		const step = STEPS[state.step];

		if (step.key === "target") {
			const pool = $body.find(".rc-pool").val();
			if (!pool) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请选择资源池")}</div>`);
				return;
			}
			state.payload.resource_pool = pool;
			state.payload.replenish_order = $body.find(".rc-order").val();
			state.payload.receipt_date = $body.find(".rc-date").val();
			const pool_row = (state.options.pools || []).find((p) => p.name === pool);
			state.payload.pool_name = pool_row ? pool_row.pool_name : pool;
			state.payload.region = pool_row ? pool_row.region : "";
		}

		if (step.key === "discover") {
			const picked = [];
			$body.find(".rc-pick:checked").each(function () {
				picked.push({
					serial_no: $(this).attr("data-serial") || $(this).attr("data-name"),
					asset: $(this).attr("data-name"),
					tag: $(this).attr("data-tag"),
					source: "自动发现",
				});
			});
			state.payload.items = picked.length
				? picked
				: state.payload.items.length
				? state.payload.items
				: [{ serial_no: "", asset: "", tag: "", source: "手工录入" }];
		}

		if (step.key === "items") {
			const items = collect_items();
			if (!items.length) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("请至少录入一条资产")}</div>`);
				return;
			}
		}

		if (step.key === "cost") {
			const total = flt_number($body.find(".c-total").val());
			if (!total) {
				$msg.html(`<div class="alert alert-warning small mb-0">${__("总成本为必填")}</div>`);
				return;
			}
			state.payload.total_cost = total;
			state.payload.capital_cost = flt_number($body.find(".c-capital").val());
			state.payload.expense_cost = flt_number($body.find(".c-expense").val());
			state.payload.remarks = $body.find(".c-remarks").val();
		}

		if (step.key === "capacity") {
			collect_capacity();
		}

		state.step = Math.min(state.step + 1, STEPS.length - 1);
		render_steps();
		render_step();
	});

	const flt_number = (val) => Number(val || 0) || 0;

	$body.on("click", ".rc-finish", function () {
		const $msg = $body.find(".rc-msg");
		$msg.html("");
		api("save_receipt", {
			values: {
				resource_pool: state.payload.resource_pool,
				replenish_order: state.payload.replenish_order,
				receipt_date: state.payload.receipt_date,
				total_cost: state.payload.total_cost,
				capital_cost: state.payload.capital_cost,
				expense_cost: state.payload.expense_cost,
				remarks: state.payload.remarks,
				items: state.payload.items,
				capacity_items: state.payload.capacity_items,
			},
			complete: 1,
		})
			.then((res) => {
				const added = res.capacity_added || {};
				$msg.html(
					`<div class="alert alert-success small mb-0">${__("接收完成")}：${esc(res.name)}（${esc(
						res.item_count
					)} ${__("条资产")}，${esc(res.capacity_count || 0)} ${__("条入库")}，${__("总成本")} ${esc(
						num(res.total_cost)
					)}）<br>
					${__("新增容量")}：CPU ${esc(num(added.cpu_total))}${esc(__("核"))} / ${__("内存")} ${esc(
						num(added.memory_total)
					)}GB / ${__("存储")} ${esc(num(added.storage_total))}TB</div>`
				);
				state.step = 0;
				state.payload.items = [];
				state.payload.capacity_items = [];
				render_steps();
				render_step();
			})
			.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err || __("保存失败"))}</div>`));
	});

	const load = () =>
		api("get_receipt_options").then((res) => {
			state.options = res;
		});

	page.set_primary_action(__("重新开始"), () => {
		state.step = 0;
		state.payload = {
			resource_pool: "",
			replenish_order: "",
			receipt_date: frappe.datetime.now_date(),
			items: [],
			capacity_items: [],
			total_cost: 0,
			capital_cost: 0,
			expense_cost: 0,
			remarks: "",
		};
		render_steps();
		render_step();
	});

	render_steps();
	render_step();
	load().then(() => {
		// 选项是异步加载的；补货单/资源池下拉在选项就绪后重绘，避免首屏为空
		if (STEPS[state.step].key === "target") render_step();
	});
};
