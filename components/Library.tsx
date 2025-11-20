import React, { useState, useRef } from 'react';
import { useApp } from '../App';
import { LibraryItem, LibraryItemType, UserRole } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import MindMapComponent from './MindMap';

const scrollbarHideStyle = `
.hide-scrollbars::-webkit-scrollbar {
    display: none;
}
.hide-scrollbars {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
}
`;

const Library: React.FC = () => {
    const { t, userRole, library, removeFromLibrary, libraryUsage } = useApp();
    const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
    const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState<LibraryItem | null>(null);
    const [zoom, setZoom] = useState(1);
    
    // Refs for panning functionality
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isPanning = useRef(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const scrollLeftStart = useRef(0);
    const scrollTopStart = useRef(0);


    const title = userRole === UserRole.TEACHER ? t('documents') : t('library');
    const emptyMessage = userRole === UserRole.TEACHER ? t('documents_empty') : t('library_empty');
    const usagePercentage = (libraryUsage.used / libraryUsage.total) * 100;

    const handleViewItem = (item: LibraryItem) => {
        setSelectedItem(item);
        setZoom(1); // Reset zoom when viewing a new item
    };

    const handleCloseModal = () => {
        setSelectedItem(null);
    };

    const handleDelete = () => {
        if (isDeleteConfirmVisible) {
            removeFromLibrary(isDeleteConfirmVisible.id);
            setIsDeleteConfirmVisible(null);
        }
    };
    
    // Panning event handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        isPanning.current = true;
        // pageX/Y gives position relative to document, good for this use case
        startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
        startY.current = e.pageY - scrollContainerRef.current.offsetTop;
        scrollLeftStart.current = scrollContainerRef.current.scrollLeft;
        scrollTopStart.current = scrollContainerRef.current.scrollTop;
        scrollContainerRef.current.style.cursor = 'grabbing';
        scrollContainerRef.current.style.userSelect = 'none';
    };

    const handleMouseUpAndLeave = () => {
        isPanning.current = false;
        if (scrollContainerRef.current) {
            scrollContainerRef.current.style.cursor = 'grab';
            scrollContainerRef.current.style.userSelect = 'auto';
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanning.current || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const y = e.pageY - scrollContainerRef.current.offsetTop;
        const walkX = (x - startX.current);
        const walkY = (y - startY.current);
        scrollContainerRef.current.scrollLeft = scrollLeftStart.current - walkX;
        scrollContainerRef.current.scrollTop = scrollTopStart.current - walkY;
    };


    const ItemCard: React.FC<{ item: LibraryItem }> = ({ item }) => {
        const date = new Date(item.timestamp).toLocaleDateString();

        return (
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm p-4 rounded-xl flex flex-col justify-between transition-transform transform hover:scale-105 hover:shadow-lg">
                <div>
                    <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">{t(item.type)}</span>
                    <h4 className="font-bold text-slate-800 mt-2 mb-1 truncate">{item.name}</h4>
                    <p className="text-xs text-slate-500 mb-4">{date}</p>
                </div>
                <div className="flex items-center justify-end space-x-2">
                    <button onClick={() => handleViewItem(item)} className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-100 rounded-lg hover:bg-indigo-200 transition-colors">{t('view')}</button>
                    <button onClick={() => setIsDeleteConfirmVisible(item)} className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">{t('delete')}</button>
                </div>
            </div>
        );
    };

    const renderItemContent = (item: LibraryItem) => {
        if (item.type === LibraryItemType.SUMMARY && item.content.mindMap) {
            return <MindMapComponent data={item.content.mindMap} />;
        }
        if (typeof item.content === 'string') {
            return <MarkdownRenderer markdown={item.content} placeholder='' />;
        }
        return <pre className="text-sm p-4 whitespace-pre-wrap break-words">{JSON.stringify(item.content, null, 2)}</pre>;
    }

    return (
        <div className="flex flex-col h-full">
            <style>{scrollbarHideStyle}</style>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">{title}</h3>
            {/* Storage Usage */}
            <div className="mb-6">
                <div className="flex justify-between items-center text-sm text-slate-600 mb-1">
                    <span>{t('storage_usage')}</span>
                    <span>{(libraryUsage.used / 1024).toFixed(2)} KB / {(libraryUsage.total / (1024 * 1024)).toFixed(0)} MB</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full" style={{ width: `${usagePercentage}%` }}></div>
                </div>
            </div>

            {/* Item Grid */}
            {library.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {library.map(item => <ItemCard key={item.id} item={item} />)}
                </div>
            ) : (
                <div className="flex-grow flex items-center justify-center text-slate-500 text-center">
                    <p>{emptyMessage}</p>
                </div>
            )}
            
            {/* View Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
                    <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                            <h3 className="text-lg font-bold truncate">{selectedItem.name}</h3>
                            <button onClick={handleCloseModal} className="text-slate-500 hover:text-slate-800 text-3xl leading-none">&times;</button>
                        </div>
                        <div 
                            ref={scrollContainerRef}
                            className="flex-grow p-2 overflow-auto hide-scrollbars bg-slate-50/50 cursor-grab"
                            onMouseDown={handleMouseDown}
                            onMouseUp={handleMouseUpAndLeave}
                            onMouseLeave={handleMouseUpAndLeave}
                            onMouseMove={handleMouseMove}
                        >
                           <div 
                                style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
                                className="transition-transform duration-200"
                            >
                                {renderItemContent(selectedItem)}
                           </div>
                        </div>
                         <div className="p-3 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
                             <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-1">
                                <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} title={t('zoom_out')} className="p-2 rounded-md hover:bg-slate-300 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                </button>
                                <button onClick={() => setZoom(1)} title={t('reset_zoom')} className="px-3 py-1 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors w-16 text-center">
                                    {Math.round(zoom * 100)}%
                                </button>
                                <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} title={t('zoom_in')} className="p-2 rounded-md hover:bg-slate-300 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                             <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">{t('close')}</button>
                         </div>
                    </div>
                </div>
            )}

             {/* Delete Confirmation Modal */}
            {isDeleteConfirmVisible && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
                         <h3 className="text-lg font-bold text-slate-900">{t('confirm_delete_title')}</h3>
                         <p className="text-slate-600 my-4">{t('confirm_delete_message')}</p>
                         <div className="flex justify-center space-x-4">
                            <button onClick={() => setIsDeleteConfirmVisible(null)} className="px-6 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors">{t('close')}</button>
                            <button onClick={handleDelete} className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">{t('delete')}</button>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Library;