import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class KLine3D {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        // 添加轨道控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;  // 添加阻尼效果
        this.controls.dampingFactor = 0.05;
        
        // 限制相机角度，使视角保持正面
        // this.controls.minPolarAngle = 0;  // 最小仰角
        // this.controls.maxPolarAngle = Math.PI / 2;  // 最大仰角
        this.controls.enableRotate = true;  // 允许旋转
        this.controls.enableZoom = true;    // 允许缩放
        this.controls.enablePan = true;     // 允许平移
        
        // 设置相机位置
        this.camera.position.set(0, 0, 20);  // 正面视角
        this.controls.target.set(0, 0, 0);
        
        // 更新控制器
        this.controls.update();
        
        // 添加环境光和平行光
        const ambientLight = new THREE.AmbientLight(0x666666);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);  // 调整光源位置
        
        // 添加网格辅助线
        const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x444444);
        gridHelper.position.y = -10;  // 将网格移到下方
        this.scene.add(gridHelper);
        
        this.scene.add(ambientLight);
        this.scene.add(directionalLight);
        
        // 保存光源和网格的引用
        this.lights = {
            ambient: ambientLight,
            directional: directionalLight
        };
        this.gridHelper = gridHelper;
        
        // 存储当前数据
        this.klineData = [];
        // 显示和滚动相关属性
        this.visibleCount = 20;  // 可见 K 线数量
        this.scrollOffset = 0;   // 滚动偏移量
        this.totalData = [];     // 存储所有数据
        
        // K 线布局参数
        this.candleWidth = 0.8;  // K 线宽度
        this.candleSpacing = 1.5; // K 线间距
        this.yAxisX = -10;      // Y 轴的 X 坐标
        
        // 添加拖动相关属性
        this.isDragging = false;
        this.startX = 0;
        this.lastX = 0;
        
        // 初始化滑动轴控制
        this.slider = document.getElementById('history-slider');
        this.slider.addEventListener('input', this.onSliderChange.bind(this));
        
        // 添加鼠标事件监听
        container.addEventListener('mousemove', this.onMouseMove.bind(this));
        container.addEventListener('mouseleave', this.hideTooltip.bind(this));
        container.addEventListener('mouseleave', this.hideCrosshair.bind(this));
        
        // 添加 CSS2D 渲染器（用于刻度标签）
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        container.appendChild(this.labelRenderer.domElement);
        
        // 创建 DOM 提示框（独立于 CSS2DRenderer）
        this.tooltipDiv = document.createElement('div');
        this.tooltipDiv.className = 'tooltip';
        this.tooltipDiv.style.display = 'none';
        container.appendChild(this.tooltipDiv);
        
        // 创建坐标轴
        this.createAxes();
        
        // 创建射线检测器
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // 创建十字星
        this.crosshair = {
            horizontal: new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(this.yAxisX, 0, 0),  // 从 Y 轴开始
                    new THREE.Vector3(15, 0, 0)  // 延伸到右侧
                ]),
                new THREE.LineBasicMaterial({ color: 0x666666, opacity: 0.5, transparent: true })
            ),
            vertical: new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, -10, 0),
                    new THREE.Vector3(0, 10, 0)
                ]),
                new THREE.LineBasicMaterial({ color: 0x666666, opacity: 0.5, transparent: true })
            )
        };
        
        // 设置相机可见层
        this.camera.layers.enable(1);
        
        // 恢复 OrbitControls 的默认设置
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // 性能优化：使用 BufferGeometry 和共享材质
        this.sharedMaterials = {
            redCandle: new THREE.MeshPhongMaterial({ 
                color: 0xff3333,
                shininess: 100,
                specular: 0x444444 
            }),
            greenCandle: new THREE.MeshPhongMaterial({ 
                color: 0x33ff33,
                shininess: 100,
                specular: 0x444444 
            })
        };
        
        // 预创建几何体
        this.candleGeometries = {
            body: new THREE.BoxGeometry(this.candleWidth, 1, this.candleWidth),
            wick: new THREE.BoxGeometry(0.2, 1, 0.2)
        };
        
        this.animate = this.animate.bind(this);
        this.animate();
    }
    
    // 创建单个 K 线
    createCandle(data, index) {
        const { open, close, high, low } = data;
        const material = close > open ? this.sharedMaterials.redCandle : this.sharedMaterials.greenCandle;
        
        // 缩放数据
        const scale = 0.5;
        const scaledOpen = open * scale;
        const scaledClose = close * scale;
        const scaledHigh = high * scale;
        const scaledLow = low * scale;
        const yOffset = -5;
        
        // 创建 K 线实体
        const bodyHeight = Math.abs(scaledClose - scaledOpen) || 0.1;
        const body = new THREE.Mesh(this.candleGeometries.body, material);
        body.scale.y = bodyHeight;  // 通过缩放调整高度而不是创建新几何体
        
        // 创建上下影线
        const wick = new THREE.Mesh(this.candleGeometries.wick, material);
        wick.scale.y = Math.abs(scaledHigh - scaledLow);  // 通过缩放调整高度
        
        // 计算 K 线的起始位置，确保最左侧的 K 线刚好在 Y 轴右侧
        const totalWidth = this.klineData.length * this.candleSpacing;
        const startX = this.yAxisX + this.candleWidth / 2 + 0.5;  // Y 轴右侧留出一点间距
        const xPos = startX + index * this.candleSpacing;
        
        // 设置位置
        body.position.set(xPos, (scaledOpen + scaledClose) / 2 + yOffset, 0);
        wick.position.set(xPos, (scaledHigh + scaledLow) / 2 + yOffset, 0);
        
        // 添加用户数据用于射线检测
        body.userData.candleType = 'body';
        body.userData.index = index;
        wick.userData.candleType = 'wick';
        wick.userData.index = index;
        
        return { body, wick };
    }
    
    // 创建坐标轴
    createAxes() {
        // 创建轴线材质
        const axisMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa, linewidth: 2 });
        
        // 创建 X 轴（时间轴）
        const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-15, -7, 0),
            new THREE.Vector3(15, -7, 0)
        ]);
        this.xAxis = new THREE.Line(xAxisGeometry, axisMaterial);
        this.scene.add(this.xAxis);
        
        // 创建 Y 轴（价格轴）
        const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(this.yAxisX, -7, 0),
            new THREE.Vector3(this.yAxisX, 5, 0)
        ]);
        this.yAxis = new THREE.Line(yAxisGeometry, axisMaterial);
        this.scene.add(this.yAxis);
        
        // 添加刻度线
        this.createTicks();
    }
    
    // 创建刻度线
    createTicks() {
        const tickMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
        
        // X 轴刻度
        for (let i = -14; i <= 14; i += 2) {
            const tickGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(i, -7, 0),
                new THREE.Vector3(i, -7.3, 0)
            ]);
            const tick = new THREE.Line(tickGeometry, tickMaterial);
            tick.isTick = true;  // 标记为刻度线
            this.scene.add(tick);
        }
        
        // Y轴刻度
        for (let i = -7; i <= 5; i += 1) {
            const tickGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(this.yAxisX, i, 0),
                new THREE.Vector3(this.yAxisX + 0.3, i, 0)
            ]);
            const tick = new THREE.Line(tickGeometry, tickMaterial);
            tick.isTick = true;  // 标记为刻度线
            this.scene.add(tick);
        }
    }
    
    // 创建文字标签（用于刻度）
    createTextLabel(text, position) {
        const div = document.createElement('div');
        div.className = 'label';
        div.textContent = text;
        div.style.color = '#cccccc';
        div.style.fontSize = '12px';
        div.style.fontFamily = 'Arial, sans-serif';
        div.style.textAlign = 'right';  // 右对齐价格标签
        div.style.paddingRight = '5px';  // 添加右侧内边距
        
        const label = new CSS2DObject(div);
        label.position.copy(position);
        
        return label;
    }
    
    // 更新坐标轴标签
    updateAxisLabels() {
        // 清除旧的标签
        this.scene.children.forEach(child => {
            if (child.isTextLabel) {
                this.scene.remove(child);
            }
        });
        
        // 更新时间轴标签
        this.klineData.forEach((data, index) => {
            if (index % 2 === 0) {
                const startX = this.yAxisX + this.candleWidth / 2 + 0.5;
                const xPos = startX + index * this.candleSpacing;
                const label = this.createTextLabel(
                    data.time || index.toString(),
                    new THREE.Vector3(xPos, -8.5, 0)
                );
                if (label) {
                    label.isTextLabel = true;
                    this.scene.add(label);
                }
            }
        });
        
        // 计算价格范围
        const prices = this.klineData.flatMap(d => [d.high, d.low]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        // 计算合适的刻度间隔
        const range = maxPrice - minPrice;
        const rawStep = range / 6;  // 期望显示7个刻度（6个间隔）
        
        // 将步长规整化为更易读的数字
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalizedStep = rawStep / magnitude;
        let step;
        if (normalizedStep <= 1) step = magnitude;
        else if (normalizedStep <= 2) step = 2 * magnitude;
        else if (normalizedStep <= 5) step = 5 * magnitude;
        else step = 10 * magnitude;
        
        // 调整最小和最大刻度值，使其为步长的整数倍
        const adjustedMin = Math.floor(minPrice / step) * step;
        const adjustedMax = Math.ceil(maxPrice / step) * step;
        
        // 创建刻度标签
        for (let price = adjustedMin; price <= adjustedMax; price += step) {
            const yPos = (price * 0.5 - 5);  // 使用与 K 线相同的缩放和偏移
            const formattedPrice = price.toFixed(
                step >= 1 ? 2 : Math.abs(Math.floor(Math.log10(step))) + 1
            );
            
            const label = this.createTextLabel(
                formattedPrice,
                new THREE.Vector3(this.yAxisX - 0.5, yPos - 0.2, 0)
            );
            if (label) {
                label.isTextLabel = true;
                label.element.style.width = '60px';  // 固定宽度确保对齐
                this.scene.add(label);
            }
        }
    }
    
    // 更新 K 线数据
    updateData(klineData, isFullData = false) {
        if (isFullData) {
            this.totalData = klineData;
            this.scrollOffset = 0;
            this.slider.value = 100;
            this.updateVisibleData();
            return;
        }
        
        this.klineData = klineData;
        
        // 存储需要删除的对象
        const objectsToRemove = [];
        
        // 清除现有的 K 线
        this.scene.children.forEach(child => {
            if (child.userData && 
                (child.userData.candleType === 'body' || 
                 child.userData.candleType === 'wick' || 
                 child.isTextLabel)) {
                objectsToRemove.push(child);
            }
        });
        
        // 删除所有标记的对象
        objectsToRemove.forEach(obj => {
            this.scene.remove(obj);
        });
        
        // 重新创建刻度线
        this.createTicks();
        
        // 添加新的 K 线
        const newObjects = [];
        klineData.forEach((data, index) => {
            const { body, wick } = this.createCandle(data, index);
            newObjects.push(body, wick);
        });
        
        // 批量添加新对象
        newObjects.forEach(obj => this.scene.add(obj));
        
        // 更新坐标轴标签
        this.updateAxisLabels();
    }
    
    // 更新可见数据
    updateVisibleData() {
        const start = Math.floor(this.scrollOffset);
        const end = start + this.visibleCount;
        const newData = this.totalData.slice(start, end);
        this.klineData = newData;
        this.updateData(this.klineData);
    }
    
    // 滑动轴变化处理
    onSliderChange(event) {
        const percentage = parseFloat(event.target.value);
        const maxScroll = this.totalData.length - this.visibleCount;
        this.scrollOffset = maxScroll * (100 - percentage) / 100;
        this.updateVisibleData();
    }
    
    // 鼠标移动事件
    onMouseMove(event) {
        // 只保留十字星和提示框的处理逻辑
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / this.container.clientHeight) * 2 + 1;
        
        // 更新射线
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // 获取所有 K 线实体
        const candleObjects = this.scene.children.filter(obj => 
            obj.isMesh && (obj.userData.candleType === 'body' || obj.userData.candleType === 'wick')
        );
        
        // 检测相交
        const intersects = this.raycaster.intersectObjects(candleObjects);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const candleIndex = intersect.object.userData.index;
            const candleData = this.klineData[candleIndex];
            
            // 更新十字星位置
            this.updateCrosshair(candleIndex);
            
            // 更新提示框
            this.updateTooltip(candleData, new THREE.Vector3(
                intersect.point.x,
                intersect.point.y,
                intersect.point.z
            ));
        } else {
            this.hideCrosshair();
            this.hideTooltip();
        }
    }
    
    // 更新十字星位置
    updateCrosshair(candleIndex) {
        if (!this.scene.children.includes(this.crosshair.horizontal)) {
            this.scene.add(this.crosshair.horizontal);
            this.scene.add(this.crosshair.vertical);
        }
        
        // 计算 K 线的中心位置
        const candleData = this.klineData[candleIndex];
        const startX = this.yAxisX + this.candleWidth / 2 + 0.5;
        const xPos = startX + candleIndex * this.candleSpacing;
        const yPos = (candleData.close * 0.5) - 5;  // 使用收盘价作为水平线位置
        
        // 更新水平线的几何体
        const horizontalPoints = [
            new THREE.Vector3(this.yAxisX, yPos, 0),  // 从 Y 轴开始
            new THREE.Vector3(15, yPos, 0)  // 延伸到右侧
        ];
        this.crosshair.horizontal.geometry.setFromPoints(horizontalPoints);
        
        // 更新垂直线的几何体
        const verticalPoints = [
            new THREE.Vector3(xPos, -7, 0),  // 从底部开始
            new THREE.Vector3(xPos, 5, 0)   // 延伸到顶部
        ];
        this.crosshair.vertical.geometry.setFromPoints(verticalPoints);
        
        // 重置位置
        this.crosshair.horizontal.position.set(0, 0, 0);
        this.crosshair.vertical.position.set(0, 0, 0);
    }
    
    // 隐藏十字星
    hideCrosshair() {
        this.scene.remove(this.crosshair.horizontal);
        this.scene.remove(this.crosshair.vertical);
    }
    
    // 更新提示框
    updateTooltip(data, point) {
        this.tooltipDiv.style.display = 'block';
        this.tooltipDiv.innerHTML = `
            <div style="color: #fff">
                <div>时间：${data.time}</div>
                <div>开：${data.open.toFixed(2)}</div>
                <div>高：${data.high.toFixed(2)}</div>
                <div>低：${data.low.toFixed(2)}</div>
                <div>收：${data.close.toFixed(2)}</div>
            </div>
        `;
        
        // 将 3D 坐标转换为屏幕坐标
        const vector = point.clone();
        vector.project(this.camera);
        
        const x = (vector.x * 0.5 + 0.5) * this.container.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * this.container.clientHeight;
        
        // 设置提示框位置
        this.tooltipDiv.style.transform = `translate(${x + 20}px, ${y - 20}px)`;
    }
    
    // 隐藏提示框
    hideTooltip() {
        this.tooltipDiv.style.display = 'none';
    }
    
    // 动画循环
    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }
    
    // 处理窗口大小变化
    resize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    // 在组件销毁时清理资源
    dispose() {
        // 清理共享材质
        Object.values(this.sharedMaterials).forEach(material => material.dispose());
        // 清理几何体
        Object.values(this.candleGeometries).forEach(geometry => geometry.dispose());
        // 清理渲染器
        this.renderer.dispose();
    }
} 