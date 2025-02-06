import { KLine3D } from './KLine3D';

// 创建容器
const container = document.getElementById('kline-container');

// 初始化 3D K 线图
const kline3d = new KLine3D(container);

// 生成更多的示例数据
const generateData = (count) => {
    const data = [];
    let lastClose = 15;
    const baseTime = new Date('2024-01-01');
    
    for (let i = 0; i < count; i++) {
        const time = new Date(baseTime);
        time.setMinutes(time.getMinutes() + i * 30);
        
        const change = (Math.random() - 0.5) * 2;
        const close = lastClose + change;
        const open = lastClose;
        const high = Math.max(open, close) + Math.random();
        const low = Math.min(open, close) - Math.random();
        
        data.push({
            time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            open,
            high,
            low,
            close
        });
        
        lastClose = close;
    }
    return data;
};

// 生成 100 个 K 线数据
const data = generateData(100);

// 更新数据
kline3d.updateData(data, true);  // 传入完整数据

// 处理窗口大小变化
window.addEventListener('resize', () => kline3d.resize());

// 在组件销毁时清理资源
window.addEventListener('beforeunload', () => {
    kline3d.dispose();
}); 