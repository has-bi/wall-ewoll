import { useState } from 'react';
import type { Category } from '../types';
import { CATEGORY_ICONS, type CategoryInput } from '../lib/board';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Props {
  initial?: Category;
  canDelete: boolean;
  onSave: (input: CategoryInput) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CategoryDialog({ initial, canDelete, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [icon, setIcon] = useState(initial?.icon || 'grid');

  return (
    <Modal
      title={initial ? 'Edit category' : 'New category'}
      submitLabel={initial ? 'Save' : 'Create category'}
      submitDisabled={!name.trim()}
      onClose={onClose}
      onSubmit={() => onSave({ name, tagline, icon })}
      footerStart={
        initial &&
        canDelete && (
          <button type="button" className="btn-text-link btn-text-link--danger" onClick={onDelete}>
            Delete
          </button>
        )
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel, Home, Gifts" maxLength={30} autoFocus />
      </label>
      <label className="field">
        <span className="field__label">Tagline (optional)</span>
        <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One line about what goes here" maxLength={120} />
      </label>
      <fieldset className="field icon-picker">
        <legend className="field__label">Icon</legend>
        <div className="icon-picker__grid">
          {CATEGORY_ICONS.map((option) => (
            <label key={option} className={`icon-picker__option${icon === option ? ' is-selected' : ''}`}>
              <input type="radio" name="category-icon" value={option} checked={icon === option} onChange={() => setIcon(option)} className="visually-hidden" />
              <Icon name={option} size={22} />
              <span className="visually-hidden">{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}
