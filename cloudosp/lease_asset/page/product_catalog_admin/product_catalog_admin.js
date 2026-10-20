frappe.pages["product-catalog-admin"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.catalog_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("产品库维护"),
		single_column: true,
	});

	$(`<style>
		.pca-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.pca-title { margin: 0 0 12px; font-weight: 600; }
		.pca-form { border: 1px solid var(--border-color); border-radius: var(--border-radius-md); padding: 12px; margin-bottom: 14px; }
		.pca-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
		.pca-row label { flex: 0 0 84px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.pca-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.pca-empty { color: var(--text-muted); font-size: 12px; }
		.pca-list th, .pca-list td { font-size: 12px; vertical-align: middle; }
	</style>`).appendTo(page.main);

	const $layout = $(`
		<div class="pca-panel">
			<ul class="nav nav-tabs pca-tabs">
				<li class="nav-item"><a class="nav-link active" href="#" data-tab="product">${__("产品库")}</a></li>
				<li class="nav-item"><a class="nav-link" href="#" data-tab="spec">${__("规格库")}</a></li>
			</ul>
			<div class="pca-body mt-3"></div>
		</div>
	`).appendTo(page.main);

	const $body = $layout.find(".pca-body");
	const state = { tab: "product", data: null };
	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
	};

	const spec_options = () =>
		(state.data ? state.data.specs : [])
			.map((s) => `<option value="${esc(s.name)}">${esc(s.spec_name)}（${esc(s.dimension || "")}·${esc(s.uom || "")}）</option>`)
			.join("");

	const pool_options = () =>
		`<option value="">${__("未指定")}</option>` +
		(state.data ? state.data.pools : [])
			.map((p) => `<option value="${esc(p.name)}">${esc(p.pool_name)}</option>`)
			.join("");

	const add_spec_row = ($tbody, row) => {
		const $row = $(`<tr>
			<td><select class="form-select form-select-sm">${spec_options()}</select></td>
			<td><input type="number" class="form-control form-control-sm" value="1" min="1" step="any"></td>
			<td><select class="form-select form-select-sm">${pool_options()}</select></td>
			<td><button class="btn btn-sm btn-outline-danger">&times;</button></td>
		</tr>`);
		if (row) {
			$row.find("select").eq(0).val(row.spec || "");
			$row.find("input").eq(0).val(row.quantity || 1);
			$row.find("select").eq(1).val(row.resource_pool || "");
		}
		$row.find("button").on("click", () => {
			if ($tbody.find("tr").length > 1) $row.remove();
		});
		$tbody.append($row);
	};

	const render_product_tab = () => {
		$body.html(`
			<div class="pca-form">
				<h6 class="pca-title">${__("新增产品")}</h6>
				<div class="pca-row">
					<label>${__("产品编码")}</label>
					<input class="form-control form-control-sm" name="product_code" style="max-width:220px">
					<label style="flex:0 0 auto">${__("产品名称")}</label>
					<input class="form-control form-control-sm" name="product_name" style="max-width:220px">
				</div>
				<div class="pca-row">
					<label>${__("类别")}</label>
					<select class="form-select form-select-sm" name="category" style="max-width:160px">
						<option value="云主机">${__("云主机")}</option>
						<option value="云存储">${__("云存储")}</option>
						<option value="网络">${__("网络")}</option>
					</select>
					<label style="flex:0 0 auto">${__("单位")}</label>
					<input class="form-control form-control-sm" name="uom" style="max-width:100px">
					<label style="flex:0 0 auto">${__("单价")}</label>
					<input type="number" class="form-control form-control-sm" name="list_price" style="max-width:120px">
				</div>
				<div class="pca-row">
					<label>${__("默认资源池")}</label>
					<select class="form-select form-select-sm" name="resource_pool" style="max-width:260px">${pool_options()}</select>
				</div>
				<table class="table table-sm pca-list">
					<thead class="thead-light"><tr>
						<th style="width:40%">${__("规格")}</th>
						<th style="width:100px">${__("数量")}</th>
						<th>${__("资源池")}</th>
						<th style="width:40px"></th>
					</tr></thead>
					<tbody></tbody>
				</table>
				<button class="btn btn-sm btn-outline-secondary pca-add-spec">${__("添加规格")}</button>
				<button class="btn btn-sm btn-primary ml-2 pca-save-product">${__("保存产品")}</button>
				<div class="pca-msg mt-2"></div>
			</div>
			<h6 class="pca-title">${__("产品列表")}</h6>
			<div class="pca-products"></div>
		`);

		const $tbody = $body.find(".pca-list tbody");
		$body.find(".pca-add-spec").on("click", () => add_spec_row($tbody));
		add_spec_row($tbody);

		$body.find(".pca-save-product").on("click", function () {
			const $form = $(this).closest(".pca-form");
			const $msg = $form.find(".pca-msg");
			const specs = $tbody.find("tr").map(function () {
				const $row = $(this);
				return {
					spec: $row.find("select").eq(0).val(),
					quantity: $row.find("input").eq(0).val(),
					resource_pool: $row.find("select").eq(1).val() || "",
				};
			}).get();

			$msg.html("");
			api("save_product", {
				values: {
					product_code: $form.find('[name="product_code"]').val(),
					product_name: $form.find('[name="product_name"]').val(),
					category: $form.find('[name="category"]').val(),
					uom: $form.find('[name="uom"]').val(),
					list_price: $form.find('[name="list_price"]').val(),
					resource_pool: $form.find('[name="resource_pool"]').val(),
					specs: specs,
				},
			})
				.then((res) => {
					$msg.html(
						`<div class="alert alert-success small mb-0">${__("已保存")}：${esc(res.product_name)}（${esc(
							res.name
						)}，${esc(res.spec_count)} ${__("条规格")}）</div>`
					);
					load();
				})
				.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err || __("保存失败"))}</div>`));
		});

		render_products();
	};

	const render_products = () => {
		if (!state.data || !state.data.products.length) {
			$body.find(".pca-products").html(`<div class="pca-empty">${__("暂无产品")}</div>`);
			return;
		}

		let html = `<table class="table table-sm table-bordered pca-list">
			<thead class="thead-light"><tr>
				<th>${__("产品")}</th><th>${__("类别")}</th><th class="text-right">${__("单价")}</th>
				<th>${__("规格（库存度量 · 资源池）")}</th><th style="width:60px"></th>
			</tr></thead><tbody>`;

		state.data.products.forEach((p) => {
			const specs = (p.specs || [])
				.map(
					(s) =>
						`<div>${esc(s.spec_name)} <span class="pca-tag">${esc(num(s.capacity_value))}${esc(
							s.capacity_unit || s.uom || ""
						)} · ${esc(s.resource_pool || __("未指定池"))}</span></div>`
				)
				.join("");
			html += `<tr>
				<td><b>${esc(p.product_name)}</b><span class="pca-tag">${esc(p.product_code || p.name)}</span></td>
				<td>${esc(p.category || "")}</td>
				<td class="text-right">${esc(num(p.list_price))}</td>
				<td>${specs || `<span class="pca-tag">${__("无规格")}</span>`}</td>
				<td><button class="btn btn-xs btn-danger pca-del" data-doctype="Lease Product" data-name="${esc(p.name)}">${__("删除")}</button></td>
			</tr>`;
		});

		html += `</tbody></table>`;
		$body.find(".pca-products").html(html);
	};

	const render_spec_tab = () => {
		$body.html(`
			<div class="pca-form">
				<h6 class="pca-title">${__("新增规格")}</h6>
				<div class="pca-row">
					<label>${__("规格名称")}</label>
					<input class="form-control form-control-sm" name="spec_name" style="max-width:200px">
					<label style="flex:0 0 auto">${__("规格类型")}</label>
					<select class="form-select form-select-sm" name="spec_type" style="max-width:140px">
						<option value="计算">${__("计算")}</option>
						<option value="存储">${__("存储")}</option>
						<option value="网络">${__("网络")}</option>
					</select>
				</div>
				<div class="pca-row">
					<label>${__("资源维度")}</label>
					<select class="form-select form-select-sm" name="dimension" style="max-width:140px">
						<option value="CPU">${__("CPU")}</option>
						<option value="内存">${__("内存")}</option>
						<option value="存储">${__("存储")}</option>
						<option value="网络">${__("网络")}</option>
						<option value="其它">${__("其它")}</option>
					</select>
					<label style="flex:0 0 auto">${__("单位")}</label>
					<input class="form-control form-control-sm" name="uom" style="max-width:100px">
					<label style="flex:0 0 auto">${__("换算系数")}</label>
					<input type="number" class="form-control form-control-sm" name="canonical_factor" value="1" step="any" style="max-width:110px">
				</div>
				<button class="btn btn-sm btn-primary pca-save-spec">${__("保存规格")}</button>
				<div class="pca-msg mt-2"></div>
			</div>
			<h6 class="pca-title">${__("规格列表")}</h6>
			<div class="pca-specs"></div>
		`);

		$body.find(".pca-save-spec").on("click", function () {
			const $form = $(this).closest(".pca-form");
			const $msg = $form.find(".pca-msg");
			$msg.html("");
			api("save_spec", {
				values: {
					spec_name: $form.find('[name="spec_name"]').val(),
					spec_type: $form.find('[name="spec_type"]').val(),
					dimension: $form.find('[name="dimension"]').val(),
					uom: $form.find('[name="uom"]').val(),
					canonical_factor: $form.find('[name="canonical_factor"]').val(),
				},
			})
				.then((res) => {
					$msg.html(
						`<div class="alert alert-success small mb-0">${__("已保存")}：${esc(res.spec_name)}</div>`
					);
					load();
				})
				.catch((err) => $msg.html(`<div class="alert alert-danger small mb-0">${esc(err || __("保存失败"))}</div>`));
		});

		render_specs();
	};

	const render_specs = () => {
		if (!state.data || !state.data.specs.length) {
			$body.find(".pca-specs").html(`<div class="pca-empty">${__("暂无规格")}</div>`);
			return;
		}

		let html = `<table class="table table-sm table-bordered pca-list">
			<thead class="thead-light"><tr>
				<th>${__("规格名称")}</th><th>${__("类型")}</th><th>${__("资源维度")}</th>
				<th>${__("单位")}</th><th class="text-right">${__("换算系数")}</th><th style="width:60px"></th>
			</tr></thead><tbody>`;

		state.data.specs.forEach((s) => {
			html += `<tr>
				<td><b>${esc(s.spec_name)}</b></td>
				<td>${esc(s.spec_type || "")}</td>
				<td>${esc(s.dimension || "")}</td>
				<td>${esc(s.uom || "")}</td>
				<td class="text-right">${esc(num(s.canonical_factor))}</td>
				<td><button class="btn btn-xs btn-danger pca-del" data-doctype="Lease Spec" data-name="${esc(s.name)}">${__("删除")}</button></td>
			</tr>`;
		});

		html += `</tbody></table>`;
		$body.find(".pca-specs").html(html);
	};

	$body.on("click", ".pca-del", function () {
		const doctype = $(this).attr("data-doctype");
		const name = $(this).attr("data-name");
		if (!confirm(__("确认删除？"))) return;
		api("delete_record", { doctype: doctype, name: name })
			.then(load)
			.catch((err) => frappe.msgprint(esc(err || __("删除失败"))));
	});

	$layout.find(".pca-tabs .nav-link").on("click", function (e) {
		e.preventDefault();
		state.tab = $(this).attr("data-tab");
		$layout.find(".pca-tabs .nav-link").removeClass("active");
		$(this).addClass("active");
		state.tab === "product" ? render_product_tab() : render_spec_tab();
	});

	const load = () => {
		api("get_catalog_data")
			.then((res) => {
				state.data = res;
				state.tab === "product" ? render_product_tab() : render_spec_tab();
			})
			.catch((err) => $body.html(`<div class="pca-empty">${esc(err || __("加载失败"))}</div>`));
	};

	page.set_primary_action(__("刷新"), load);

	load();
};
