import { useState } from 'react';
import { Layout, Menu, Button } from 'antd';
import { AreaChartOutlined, EnvironmentOutlined, AimOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Checkbox, Divider } from 'antd';
import { useAppStore } from './store/appStore';
import MapPage from './routes/MapPage';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/map', label: 'Map', icon: <AreaChartOutlined /> },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  // 解构 Store 状态，避免在 JSX 中频繁调用 hook
  const {
    showBuildings,
    showRoads,
    showPoints,
    toggleLayer,
    navMode,
    navStart,
    navEnd,
    navDistance,
    setNavMode,
    clearNav
  } = useAppStore();

  return (
    <Layout className="app-shell">
      <Header className="app-header">Smart Campus 3D</Header>
      <Layout>
        <Sider
          width={220}
          className="app-sider"
          collapsible
          collapsed={collapsed}
          onCollapse={(val) => setCollapsed(val)}
          theme="light"
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ borderRight: 0 }}
          />

          {!collapsed && (
            <div className="sidebar-extra-content">
              <Divider orientation="left" style={{ margin: '12px 0', fontSize: '12px', color: '#64748b' }}>
                图层控制
              </Divider>

              <div className="layer-controls">
                <div className="layer-item">
                  <Checkbox
                    checked={showBuildings}
                    onChange={() => toggleLayer('buildings')}
                  >
                    2.5D 建筑物
                  </Checkbox>
                </div>
                <div className="layer-item">
                  <Checkbox
                    checked={showRoads}
                    onChange={() => toggleLayer('roads')}
                  >
                    校园道路
                  </Checkbox>
                </div>
                <div className="layer-item">
                  <Checkbox
                    checked={showPoints}
                    onChange={() => toggleLayer('points')}
                  >
                    校园点要素
                  </Checkbox>
                </div>
              </div>

              <Divider orientation="left" style={{ margin: '12px 0', fontSize: '12px', color: '#64748b' }}>
                校园导航
              </Divider>

              <div className="nav-controls">
                <Button
                  type={navMode === 'selectStart' ? 'primary' : 'default'}
                  icon={<EnvironmentOutlined />}
                  block
                  style={{ marginBottom: 8 }}
                  onClick={() => setNavMode(navMode === 'selectStart' ? 'idle' : 'selectStart')}
                >
                  {navStart ? '起点已选' : '选择起点'}
                </Button>
                <Button
                  type={navMode === 'selectEnd' ? 'primary' : 'default'}
                  icon={<AimOutlined />}
                  block
                  style={{ marginBottom: 8 }}
                  onClick={() => setNavMode(navMode === 'selectEnd' ? 'idle' : 'selectEnd')}
                  disabled={!navStart}
                >
                  {navEnd ? '终点已选' : '选择终点'}
                </Button>
                {navDistance !== null && (
                  <div className="nav-distance">
                    路线距离: <strong>{(navDistance / 1000).toFixed(2)} km</strong>
                  </div>
                )}
                {(navStart || navEnd) && (
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    block
                    onClick={clearNav}
                  >
                    清除路线
                  </Button>
                )}
              </div>
            </div>
          )}
        </Sider>
        <Content className="app-content">
          <Routes>
            <Route path="/map" element={<MapPage />} />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
