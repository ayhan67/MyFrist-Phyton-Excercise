const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'isg-frontend/src/pages/field/AdminMobileDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `            } else {

                .field-dashboard {`;

const target2 = `            } else {\n\n                .field-dashboard {`;
const target3 = `            } else {\r\n\r\n                .field-dashboard {`;

const repl = `            } else {
                logger.error('Failed to fetch admin stats');
                if (response.status === 401) logout();
            }
        } catch (error) {
            logger.error('Failed to fetch admin dashboard stats', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Yükleniyor...</p>
            </div>
        );
    }

    if (!stats) return <div style={{ padding: '20px', textAlign: 'center' }}>Veri yüklenemedi.</div>;

    const renderMinuteCard = (title: string, data: any, listData: any[] | undefined, color: string = '#3498db') => (
        <div className="admin-stat-card"
            onClick={() => setSelectedStat({ title, data: listData || [], color, showProgress: false })}
            style={{ alignItems: 'flex-start', padding: '10px', cursor: 'pointer' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c3e50' }}>{title}</span>
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#000', marginBottom: '1px', fontWeight: 'bold' }}>Toplam DK</span>
                    <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{data?.total || 0}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ color: '#000', marginBottom: '1px', fontWeight: 'bold' }}>Kalan DK</span>
                    <span style={{ fontWeight: 'bold', color: color }}>{data?.remaining || 0}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="field-dashboard">
            <style>
                {\`
                .field-dashboard {`;

if (content.includes(target1)) {
    content = content.replace(target1, repl);
    console.log('Replaced target1');
} else if (content.includes(target2)) {
    content = content.replace(target2, repl);
    console.log('Replaced target2');
} else if (content.includes(target3)) {
    content = content.replace(target3, repl);
    console.log('Replaced target3');
} else {
    console.log('Target not found in file!');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done.');
